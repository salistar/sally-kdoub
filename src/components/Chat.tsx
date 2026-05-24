/**
 * @file src/components/Chat.tsx
 * @description Chat texte temps réel des rooms (namespace /chat) — pendant RN
 *   exact du Chat web (apps/web/app/games/Chat.tsx). MÊME protocole :
 *     - io(`${SOCKET}/chat`, { auth: { token } })
 *     - à la connexion : emit('chat:join', { roomId })
 *     - écoute 'chat:message' { id, senderId, senderName, content, timestamp }
 *     - envoi : emit('chat:message', { roomId, content })
 *     - sortie : emit('chat:leave', { roomId })
 *   ⇒ un joueur web et un joueur mobile dans la même room (roomId = kdoub-CODE)
 *   voient les mêmes messages.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { getSocketUrl, getAuthToken } from '../../shared/api';

const GOLD = '#FCD34D';

interface Msg { id: string; senderId: string; senderName: string; content: string; timestamp: string }

export default function Chat({ roomId, token, onClose }: { roomId: string; token?: string | null; onClose?: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const listRef = useRef<ScrollView>(null);

  useEffect(() => {
    const tok = token ?? getAuthToken();
    if (!tok || !roomId) return;
    const s = io(`${getSocketUrl()}/chat`, { transports: ['websocket'], auth: { token: tok } });
    socketRef.current = s;
    s.on('connect', () => s.emit('chat:join', { roomId }));
    s.on('chat:message', (m: Msg) => setMsgs((prev) => [...prev.slice(-80), m]));
    return () => { try { s.emit('chat:leave', { roomId }); } catch {} s.disconnect(); socketRef.current = null; };
  }, [token, roomId]);

  useEffect(() => { const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50); return () => clearTimeout(t); }, [msgs]);

  const send = () => {
    const c = text.trim();
    if (!c || !socketRef.current) return;
    socketRef.current.emit('chat:message', { roomId, content: c });
    setText('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>💬 Chat</Text>
        {onClose && (
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={20} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>
      <ScrollView ref={listRef} style={styles.list} contentContainerStyle={styles.listContent}>
        {msgs.length === 0 && <Text style={styles.empty}>Aucun message. Dis bonjour 👋</Text>}
        {msgs.map((m) => (
          <View key={m.id} style={styles.msg}>
            <Text style={styles.sender}>{m.senderName}</Text>
            <Text style={styles.content}>{m.content}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="Message…"
          placeholderTextColor="#64748B"
          maxLength={500}
          returnKeyType="send"
          style={styles.input}
        />
        <TouchableOpacity onPress={send} style={styles.sendBtn}>
          <Ionicons name="send" size={18} color="#0A1535" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 300, backgroundColor: '#0A1429', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  title: { color: '#fff', fontFamily: 'Inter-Bold', fontSize: 14 },
  list: { flex: 1 },
  listContent: { padding: 10, gap: 8 },
  empty: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: 20 },
  msg: { alignSelf: 'flex-start', maxWidth: '90%' },
  sender: { color: GOLD, fontSize: 11, fontFamily: 'Inter-Bold' },
  content: { color: '#E2E8F0', fontSize: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginTop: 2 },
  inputRow: { flexDirection: 'row', gap: 6, padding: 8, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  input: { flex: 1, backgroundColor: '#152A47', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, color: '#fff', fontSize: 14 },
  sendBtn: { width: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD, borderRadius: 10 },
});
