/**
 * @file (tabs)/maps.tsx
 * @description Écran Carte — "hkim" (trajectoires) complet.
 *
 * - 10 hkim + historique (seedé) — couleurs différentes par état.
 * - Itinéraire routier réel (Google Directions) tracé sur la carte.
 * - Affichage : tout / masquer / un seul spécifique.
 * - "Lance hkim" sur le point de départ → turn-by-turn + vue 3D.
 * - Onglets : À faire / Historique / Actualité (fil temps réel des
 *   autres joueurs via Socket.IO — pas de TURN/STUN nécessaire).
 * - Commentaires sur les exploits + partage réseaux sociaux à la fin.
 * - Persistance locale (AsyncStorage) tant que le compte est actif.
 *
 * Carte = Google Maps JS dans une WebView (OK en Expo Go).
 * @project SallyCards - Kdoub
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Share,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getHkims,
  completeHkim,
  regenerateHkims,
  seedHkimHistory,
  getHkimFeed,
  addHkimComment,
  getAuthToken,
  type Hkim,
  type HkimFeedItem,
} from '../../shared/api';
import { useHkimFeed } from '../../shared/useHkimFeed';
import { APP_CONFIG } from '../../src/config/app.config';

const GOOGLE_MAPS_KEY = 'AIzaSyAa1lBSroSXA-Om4mio84-SWAcmzQgYv8w';
const THEME_PRIMARY = (APP_CONFIG as any).primary || '#C084FC';
const THEME_SECONDARY = (APP_CONFIG as any).secondary || '#7C3AED';
const CACHE_KEY = 'kdoub.hkim.cache.v1';
const START_RADIUS_M = 120;

type Status = 'loading' | 'ready' | 'denied' | 'error';
type LatLng = { lat: number; lng: number };
type Step = { text: string; distance: string };
type Tab = 'todo' | 'history' | 'feed';

// ─── helpers géo ───────────────────────────────
function distM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function bearing(a: LatLng, b: LatLng) {
  const y =
    Math.sin(((b.lng - a.lng) * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
function decodePolyline(enc: string): LatLng[] {
  let idx = 0,
    lat = 0,
    lng = 0;
  const pts: LatLng[] = [];
  while (idx < enc.length) {
    let b,
      shift = 0,
      result = 0;
    do {
      b = enc.charCodeAt(idx++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = enc.charCodeAt(idx++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}
const stripHtml = (s: string) =>
  s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function timeAgo(iso?: string) {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `il y a ${s}s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

// couleurs par état (pilotées par le thème de l'app → distinctes par jeu)
const COL = {
  pendingLine: THEME_PRIMARY,
  pendingStart: '#16A34A',
  pendingEnd: '#DC2626',
  doneLine: '#64748B',
  doneStart: '#475569',
  doneEnd: '#475569',
  route: '#FCD34D',
  user: THEME_SECONDARY,
};

// ─── HTML carte ────────────────────────────────
function buildHtml(
  user: LatLng,
  hkims: Hkim[],
  route: { path: LatLng[]; bearing: number } | null,
  focus: LatLng | null,
) {
  const data = JSON.stringify({ user, hkims, route, focus, COL });
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#0A1929}</style>
</head><body><div id="map"></div>
<script>
  var D = ${data};
  function decodePoly(enc){
    var idx=0,lat=0,lng=0,pts=[];
    while(idx<enc.length){
      var b,sh=0,res=0;
      do{ b=enc.charCodeAt(idx++)-63; res|=(b&0x1f)<<sh; sh+=5; }while(b>=0x20);
      lat += (res&1)?~(res>>1):(res>>1);
      sh=0;res=0;
      do{ b=enc.charCodeAt(idx++)-63; res|=(b&0x1f)<<sh; sh+=5; }while(b>=0x20);
      lng += (res&1)?~(res>>1):(res>>1);
      pts.push({lat:lat/1e5,lng:lng/1e5});
    }
    return pts;
  }
  function initMap(){
    var center = D.focus || (D.route && D.route.path.length ? D.route.path[0] : D.user);
    var map = new google.maps.Map(document.getElementById('map'), {
      center: center, zoom: D.route ? 16 : (D.focus ? 15 : 13),
      disableDefaultUI:false, fullscreenControl:false, mapTypeControl:false,
      streetViewControl:false, clickableIcons:false,
      mapTypeId: D.route ? 'hybrid' : 'roadmap'
    });
    new google.maps.Marker({ position:D.user, map:map, title:'Vous',
      icon:{ path:google.maps.SymbolPath.CIRCLE, scale:7, fillColor:D.COL.user,
             fillOpacity:1, strokeColor:'#fff', strokeWeight:2 } });
    D.hkims.forEach(function(h){
      var done = h.status === 'done';
      new google.maps.Marker({ position:{lat:h.start.lat,lng:h.start.lng}, map:map,
        label:{ text:String(h.order), color:'#fff', fontSize:'11px', fontWeight:'700' },
        title:h.name+' — '+(done?'(fait) ':'')+'départ',
        icon:{ path:google.maps.SymbolPath.CIRCLE, scale:12,
               fillColor: done ? D.COL.doneStart : D.COL.pendingStart, fillOpacity:1,
               strokeColor:'#fff', strokeWeight:2 } });
      new google.maps.Marker({ position:{lat:h.end.lat,lng:h.end.lng}, map:map,
        title:h.name+' — arrivée',
        icon:{ path:'M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z',
               fillColor: done ? D.COL.doneEnd : D.COL.pendingEnd, fillOpacity:1,
               strokeColor:'#fff', strokeWeight:1, scale:1.4,
               anchor:new google.maps.Point(12,22) } });
      var poly = (h.routePolyline && h.routePolyline.length)
        ? decodePoly(h.routePolyline)
        : [{lat:h.start.lat,lng:h.start.lng},{lat:h.end.lat,lng:h.end.lng}];
      new google.maps.Polyline({ map:map, path:poly, geodesic:false,
        strokeColor: done ? D.COL.doneLine : D.COL.pendingLine,
        strokeOpacity: done ? 0.55 : 0.95, strokeWeight:4 });
    });
    if (D.route && D.route.path.length){
      new google.maps.Polyline({ map:map, path:D.route.path, geodesic:true,
        strokeColor:D.COL.route, strokeOpacity:1, strokeWeight:6 });
      try { map.setTilt(67.5); map.setHeading(D.route.bearing); map.setZoom(17); } catch(e){}
    }
  }
  window.gm_authFailure=function(){
    document.body.innerHTML='<div style="color:#fff;font-family:sans-serif;padding:24px;text-align:center">Erreur clé Google Maps (API JS / restrictions).</div>';
  };
</script>
<script async defer src="https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&callback=initMap"></script>
</body></html>`;
}

export default function MapsScreen() {
  const [user, setUser] = useState<LatLng>({ lat: 33.5731, lng: -7.5898 });
  const [status, setStatus] = useState<Status>('loading');
  const [hkims, setHkims] = useState<Hkim[]>([]);
  const [active, setActive] = useState<Hkim | null>(null);
  const [route, setRoute] = useState<{ path: LatLng[]; bearing: number } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('todo');

  // visibilité : ids masqués + "solo" (un seul affiché)
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [soloId, setSoloId] = useState<string | null>(null);

  // fil d'actualité
  const [feed, setFeed] = useState<HkimFeedItem[]>([]);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const token = getAuthToken();
  const { connected, lastFeed, lastComment, announceCompleted, announceComment } =
    useHkimFeed(token);

  // ─── chargement ───────────────────────────────
  const load = async () => {
    try {
      setStatus('loading');
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setHkims(JSON.parse(cached));
        setStatus('denied');
        return;
      }
      const p = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const u = { lat: p.coords.latitude, lng: p.coords.longitude };
      setUser(u);
      console.log('[Kdoub/Maps] position', u.lat, u.lng);

      if (!getAuthToken()) {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) setHkims(JSON.parse(cached));
        setStatus('ready');
        return;
      }
      const list = await getHkims(u.lat, u.lng);
      setHkims(list);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(list));
      try {
        setFeed(await getHkimFeed(30));
      } catch {}
      setStatus('ready');
    } catch (e) {
      console.log('[Kdoub/Maps] error', e);
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) setHkims(JSON.parse(cached));
      setStatus(hkims.length ? 'ready' : 'error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // socket : nouveaux exploits / commentaires en temps réel
  useEffect(() => {
    if (lastFeed) {
      setFeed((f) => [
        {
          hkimId: lastFeed.hkimId,
          userId: lastFeed.userId,
          username: lastFeed.username,
          name: lastFeed.name,
          from: lastFeed.from,
          to: lastFeed.to,
          distanceMeters: lastFeed.distanceMeters,
          completedAt: lastFeed.completedAt,
          comments: [],
        },
        ...f.filter((x) => x.hkimId !== lastFeed.hkimId),
      ]);
    }
  }, [lastFeed]);

  useEffect(() => {
    if (lastComment) {
      setFeed((f) =>
        f.map((it) =>
          it.hkimId === lastComment.hkimId
            ? {
                ...it,
                comments: [
                  ...it.comments,
                  {
                    username: lastComment.username,
                    text: lastComment.text,
                    createdAt: lastComment.createdAt,
                  },
                ],
              }
            : it,
        ),
      );
    }
  }, [lastComment]);

  const nearest = useMemo(() => {
    let best: { h: Hkim; d: number } | null = null;
    for (const h of hkims) {
      if (h.status === 'done') continue;
      const d = distM(user, { lat: h.start.lat, lng: h.start.lng });
      if (!best || d < best.d) best = { h, d };
    }
    return best;
  }, [hkims, user]);

  const canLaunch = !!nearest && nearest.d <= START_RADIUS_M && !active;

  // hkim visibles sur la carte (masquage + solo)
  const visibleHkims = useMemo(() => {
    let list = hkims;
    if (soloId) list = list.filter((h) => h._id === soloId);
    else list = list.filter((h) => !hidden.has(h._id));
    return list;
  }, [hkims, hidden, soloId]);

  const launch = async (h: Hkim) => {
    try {
      setBusy(true);
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${h.start.lat},${h.start.lng}&destination=${h.end.lat},${h.end.lng}&mode=walking&key=${GOOGLE_MAPS_KEY}`;
      const res = await fetch(url);
      const j = await res.json();
      if (j.status !== 'OK' || !j.routes?.length) {
        const path =
          h.routePolyline && h.routePolyline.length
            ? decodePolyline(h.routePolyline)
            : [
                { lat: h.start.lat, lng: h.start.lng },
                { lat: h.end.lat, lng: h.end.lng },
              ];
        setRoute({ path, bearing: bearing(path[0], path[path.length - 1]) });
        setSteps([{ text: `Suivre l'itinéraire vers ${h.end.label}`, distance: '' }]);
      } else {
        const r = j.routes[0];
        const path = decodePolyline(r.overview_polyline.points);
        const leg = r.legs[0];
        const st: Step[] = (leg.steps || []).map((s: any) => ({
          text: stripHtml(s.html_instructions || ''),
          distance: s.distance?.text || '',
        }));
        setSteps(st.length ? st : [{ text: `Vers ${h.end.label}`, distance: leg.distance?.text || '' }]);
        setRoute({
          path,
          bearing: bearing(
            { lat: h.start.lat, lng: h.start.lng },
            { lat: h.end.lat, lng: h.end.lng },
          ),
        });
      }
      setActive(h);
      setFocus(null);
    } catch (e) {
      console.log('[Kdoub/Maps] directions error', e);
    } finally {
      setBusy(false);
    }
  };

  const finish = async (h: Hkim) => {
    try {
      setBusy(true);
      try {
        await completeHkim(h._id);
      } catch {}
      const next = hkims.map((x) =>
        x._id === h._id
          ? { ...x, status: 'done' as const, completedAt: new Date().toISOString() }
          : x,
      );
      setHkims(next);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
      setActive(null);
      setRoute(null);
      setSteps([]);

      // fil temps réel (socket)
      announceCompleted({
        hkimId: h._id,
        name: h.name,
        from: h.start.label,
        to: h.end.label,
        distanceMeters: h.distanceMeters,
      });
      // partage réseaux sociaux
      try {
        await Share.share({
          message: `🏆 J'ai terminé ${h.name} sur Kdoub : ${h.start.label} → ${h.end.label} (${(h.distanceMeters / 1000).toFixed(1)} km) ! #Kdoub #Hkim`,
        });
      } catch {}
    } finally {
      setBusy(false);
    }
  };

  const regen = async () => {
    try {
      setBusy(true);
      const list = await regenerateHkims(user.lat, user.lng);
      setHkims(list);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(list));
      setActive(null);
      setRoute(null);
      setSteps([]);
    } catch (e) {
      console.log('[Kdoub/Maps] regen error', e);
    } finally {
      setBusy(false);
    }
  };

  const seedHist = async () => {
    try {
      setBusy(true);
      await seedHkimHistory(user.lat, user.lng);
      const list = await getHkims(user.lat, user.lng);
      setHkims(list);
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(list));
      try {
        setFeed(await getHkimFeed(30));
      } catch {}
      setTab('history');
    } catch (e) {
      console.log('[Kdoub/Maps] seed error', e);
    } finally {
      setBusy(false);
    }
  };

  const sendComment = async (hkimId: string) => {
    const txt = commentText.trim();
    if (!txt) return;
    setCommentText('');
    setFeed((f) =>
      f.map((it) =>
        it.hkimId === hkimId
          ? {
              ...it,
              comments: [
                ...it.comments,
                { username: 'Moi', text: txt, createdAt: new Date().toISOString() },
              ],
            }
          : it,
      ),
    );
    try {
      await addHkimComment(hkimId, txt);
    } catch {}
    announceComment({ hkimId, text: txt });
  };

  const toggleHide = (id: string) => {
    setSoloId(null);
    setHidden((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const html = useMemo(
    () => buildHtml(user, visibleHkims, route, focus),
    [user, visibleHkims, route, focus],
  );
  const webKey = `${visibleHkims.length}|${active?._id || 'n'}|${route ? route.path.length : 0}|${focus ? focus.lat : 0}|${soloId || ''}`;

  const done = hkims.filter((h) => h.status === 'done');
  const pending = hkims.filter((h) => h.status === 'pending');
  const history = [...done].sort(
    (a, b) =>
      new Date(b.completedAt || 0).getTime() -
      new Date(a.completedAt || 0).getTime(),
  );

  return (
    <View style={styles.container}>
      <WebView
        key={webKey}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://localhost/' }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color="#C084FC" size="large" />
          </View>
        )}
      />

      {/* header + légende couleurs */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Hkim {connected ? '🟢' : '⚪'}
        </Text>
        <Text style={styles.headerSub}>
          {status === 'ready'
            ? `${done.length}/${hkims.length} faits`
            : status === 'denied'
            ? 'Localisation refusée'
            : status === 'error'
            ? 'Erreur'
            : 'Chargement…'}
        </Text>
        <View style={styles.legendRow}>
          <Text style={[styles.legendDot, { color: COL.pendingStart }]}>● à faire</Text>
          <Text style={[styles.legendDot, { color: COL.doneStart }]}>● fait</Text>
        </View>
      </View>

      {/* contrôles visibilité */}
      <View style={styles.visBar}>
        <TouchableOpacity onPress={() => { setHidden(new Set()); setSoloId(null); }}>
          <Text style={styles.visBtn}>👁 Tout</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setHidden(new Set(hkims.map((h) => h._id)))}
        >
          <Text style={styles.visBtn}>🚫 Aucun</Text>
        </TouchableOpacity>
        {soloId && (
          <TouchableOpacity onPress={() => setSoloId(null)}>
            <Text style={[styles.visBtn, { color: '#FCD34D' }]}>✕ Solo</Text>
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity style={styles.recenter} onPress={load} activeOpacity={0.85}>
        {status === 'loading' || busy ? (
          <ActivityIndicator color="#0A1929" />
        ) : (
          <Text style={styles.recenterIcon}>📍</Text>
        )}
      </TouchableOpacity>

      {canLaunch && nearest && (
        <TouchableOpacity
          style={styles.launchBtn}
          onPress={() => launch(nearest.h)}
          activeOpacity={0.9}
          disabled={busy}
        >
          <Text style={styles.launchTxt}>
            🚩 Lance {nearest.h.name}  ·  {Math.round(nearest.d)} m du départ
          </Text>
        </TouchableOpacity>
      )}
      {!canLaunch && !active && nearest && (
        <View style={styles.hintBox}>
          <Text style={styles.hintTxt}>
            Rapproche-toi du départ de {nearest.h.name} ({Math.round(nearest.d)} m).
          </Text>
        </View>
      )}

      {active && (
        <View style={styles.routePanel}>
          <Text style={styles.routeTitle}>
            🧭 {active.name} → {active.end.label} (3D)
          </Text>
          <ScrollView style={{ maxHeight: 120 }}>
            {steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepIdx}>{i + 1}</Text>
                <Text style={styles.stepTxt}>
                  {s.text}
                  {s.distance ? `  (${s.distance})` : ''}
                </Text>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.finishBtn}
            onPress={() => finish(active)}
            disabled={busy}
          >
            <Text style={styles.finishTxt}>
              ✅ Arrivé — terminer & partager {active.name}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* panneau onglets */}
      {!active && (
        <View style={styles.listPanel}>
          <View style={styles.tabsRow}>
            {(['todo', 'history', 'feed'] as Tab[]).map((tk) => (
              <TouchableOpacity
                key={tk}
                style={[styles.tab, tab === tk && styles.tabActive]}
                onPress={() => setTab(tk)}
              >
                <Text style={[styles.tabTxt, tab === tk && styles.tabTxtActive]}>
                  {tk === 'todo'
                    ? `À faire (${pending.length})`
                    : tk === 'history'
                    ? `Historique (${history.length})`
                    : `Actualité (${feed.length})`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {tab !== 'feed' && (
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={regen} disabled={busy}>
                <Text style={styles.regen}>↻ Régénérer</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={seedHist} disabled={busy}>
                <Text style={styles.regen}>＋ Seed historique</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView style={{ maxHeight: 175 }}>
            {tab === 'todo' &&
              pending.map((h) => (
                <View key={h._id} style={styles.listRow}>
                  <TouchableOpacity onPress={() => toggleHide(h._id)}>
                    <Text style={styles.eye}>
                      {hidden.has(h._id) ? '🙈' : '👁'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() =>
                      setFocus({ lat: h.start.lat, lng: h.start.lng })
                    }
                  >
                    <Text style={styles.listName}>
                      {h.name} · {(h.distanceMeters / 1000).toFixed(1)} km
                    </Text>
                    <Text style={styles.listMeta}>
                      Avant {new Date(h.maxDate).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSoloId(h._id)}>
                    <Text style={styles.solo}>Solo</Text>
                  </TouchableOpacity>
                </View>
              ))}

            {tab === 'history' &&
              history.map((h) => (
                <View key={h._id} style={styles.listRow}>
                  <Text style={styles.listDot}>✅</Text>
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() =>
                      setFocus({ lat: h.start.lat, lng: h.start.lng })
                    }
                  >
                    <Text style={styles.listName}>
                      {h.name} · {(h.distanceMeters / 1000).toFixed(1)} km
                    </Text>
                    <Text style={styles.listMeta}>
                      Fait le{' '}
                      {h.completedAt
                        ? new Date(h.completedAt).toLocaleString()
                        : '—'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSoloId(h._id)}>
                    <Text style={styles.solo}>Solo</Text>
                  </TouchableOpacity>
                </View>
              ))}

            {tab === 'feed' &&
              feed.map((it) => (
                <View key={it.hkimId} style={styles.feedRow}>
                  <Text style={styles.feedTitle}>
                    🏅 {it.username} a terminé {it.name}
                  </Text>
                  <Text style={styles.feedMeta}>
                    {it.from} → {it.to} · {(it.distanceMeters / 1000).toFixed(1)} km ·{' '}
                    {timeAgo(it.completedAt)}
                  </Text>
                  {it.comments.map((c, i) => (
                    <Text key={i} style={styles.cmt}>
                      💬 {c.username}: {c.text}
                    </Text>
                  ))}
                  {commentFor === it.hkimId ? (
                    <View style={styles.cmtBox}>
                      <TextInput
                        style={styles.cmtInput}
                        placeholder="Commenter l'exploit…"
                        placeholderTextColor="#64748B"
                        value={commentText}
                        onChangeText={setCommentText}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          sendComment(it.hkimId);
                          setCommentFor(null);
                        }}
                      >
                        <Text style={styles.cmtSend}>Envoyer</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        setCommentFor(it.hkimId);
                        setCommentText('');
                      }}
                    >
                      <Text style={styles.cmtLink}>💬 Commenter</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}

            {tab === 'todo' && !pending.length && (
              <Text style={styles.emptyTxt}>
                {hkims.length
                  ? '🎉 Tous les hkim sont effectués !'
                  : 'Aucun hkim. Active la localisation puis recharge.'}
              </Text>
            )}
            {tab === 'history' && !history.length && (
              <Text style={styles.emptyTxt}>
                Aucun hkim effectué. Termine un trajet ou « Seed historique ».
              </Text>
            )}
            {tab === 'feed' && !feed.length && (
              <Text style={styles.emptyTxt}>
                Aucune actualité. Les exploits des autres joueurs apparaîtront ici.
              </Text>
            )}
          </ScrollView>
        </View>
      )}

      {status === 'denied' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Autorise la localisation pour générer/voir tes hkim.
          </Text>
          <TouchableOpacity onPress={load}>
            <Text style={styles.bannerAction}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A1929' },
  web: { flex: 1, backgroundColor: '#0A1929' },
  loading: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A1929',
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    top: 44,
    left: 12,
    backgroundColor: 'rgba(10,25,41,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerSub: { color: '#C084FC', fontSize: 11, fontWeight: '600', marginTop: 2 },
  legendRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  legendDot: { fontSize: 10, fontWeight: '700' },
  visBar: {
    position: 'absolute',
    top: 44,
    right: 70,
    flexDirection: 'row',
    gap: 6,
  },
  visBtn: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(10,25,41,0.85)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  recenter: {
    position: 'absolute',
    right: 14,
    top: 44,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#C084FC',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
  recenterIcon: { fontSize: 20 },
  launchBtn: {
    position: 'absolute',
    bottom: 250,
    left: 16,
    right: 16,
    backgroundColor: '#16A34A',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 6,
  },
  launchTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  hintBox: {
    position: 'absolute',
    bottom: 250,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(124,58,237,0.9)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  hintTxt: { color: '#fff', fontSize: 12, textAlign: 'center' },
  routePanel: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(10,25,41,0.96)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(192,132,252,0.4)',
  },
  routeTitle: { color: '#FCD34D', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  stepRow: { flexDirection: 'row', gap: 10, marginBottom: 8, alignItems: 'flex-start' },
  stepIdx: {
    color: '#0A1929',
    backgroundColor: '#C084FC',
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 22,
    fontWeight: '800',
    fontSize: 12,
  },
  stepTxt: { color: '#E2E8F0', fontSize: 13, flex: 1, lineHeight: 18 },
  finishBtn: {
    marginTop: 10,
    backgroundColor: '#16A34A',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  finishTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  listPanel: {
    position: 'absolute',
    bottom: 16,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(10,25,41,0.94)',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#7C3AED' },
  tabTxt: { color: '#94A3B8', fontSize: 11, fontWeight: '700' },
  tabTxtActive: { color: '#fff' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  regen: { color: '#C084FC', fontSize: 12, fontWeight: '700' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  listDot: { fontSize: 16 },
  eye: { fontSize: 16 },
  solo: { color: '#FCD34D', fontSize: 11, fontWeight: '800' },
  listName: { color: '#fff', fontSize: 13, fontWeight: '700' },
  listMeta: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  feedRow: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  feedTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  feedMeta: { color: '#94A3B8', fontSize: 11, marginTop: 2 },
  cmt: { color: '#CBD5E1', fontSize: 12, marginTop: 4, marginLeft: 6 },
  cmtLink: { color: '#C084FC', fontSize: 12, fontWeight: '700', marginTop: 6 },
  cmtBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  cmtInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#fff',
    fontSize: 13,
  },
  cmtSend: { color: '#16A34A', fontWeight: '800', fontSize: 13 },
  emptyTxt: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  banner: {
    position: 'absolute',
    top: 110,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(124,58,237,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  bannerText: { color: '#fff', fontSize: 13, flex: 1 },
  bannerAction: { color: '#FCD34D', fontWeight: '800', fontSize: 13 },
});

/* === End of (tabs)/maps.tsx — Kdoub (hkim + feed socket + comments + share) === */
