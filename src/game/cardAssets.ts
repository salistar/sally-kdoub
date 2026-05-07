/**
 * Mapping des images de cartes espagnoles
 * Chaque carte est chargée via require() pour React Native
 * Format fichier: {valeur}{suite}.png (ex: 1B.png, 12O.png)
 * Clé mapping: {valeur}-{suite_longue} (ex: 01-bastos, 12-oros)
 */

const CARD_IMAGES: Record<string, ReturnType<typeof require>> = {
  '01-bastos': require('../../assets/cards/1B.png'),
  '01-copas': require('../../assets/cards/1C.png'),
  '01-espadas': require('../../assets/cards/1E.png'),
  '01-oros': require('../../assets/cards/1O.png'),
  '02-bastos': require('../../assets/cards/2B.png'),
  '02-copas': require('../../assets/cards/2C.png'),
  '02-espadas': require('../../assets/cards/2E.png'),
  '02-oros': require('../../assets/cards/2O.png'),
  '03-bastos': require('../../assets/cards/3B.png'),
  '03-copas': require('../../assets/cards/3C.png'),
  '03-espadas': require('../../assets/cards/3E.png'),
  '03-oros': require('../../assets/cards/3O.png'),
  '04-bastos': require('../../assets/cards/4B.png'),
  '04-copas': require('../../assets/cards/4C.png'),
  '04-espadas': require('../../assets/cards/4E.png'),
  '04-oros': require('../../assets/cards/4O.png'),
  '05-bastos': require('../../assets/cards/5B.png'),
  '05-copas': require('../../assets/cards/5C.png'),
  '05-espadas': require('../../assets/cards/5E.png'),
  '05-oros': require('../../assets/cards/5O.png'),
  '06-bastos': require('../../assets/cards/6B.png'),
  '06-copas': require('../../assets/cards/6C.png'),
  '06-espadas': require('../../assets/cards/6E.png'),
  '06-oros': require('../../assets/cards/6O.png'),
  '07-bastos': require('../../assets/cards/7B.png'),
  '07-copas': require('../../assets/cards/7C.png'),
  '07-espadas': require('../../assets/cards/7E.png'),
  '07-oros': require('../../assets/cards/7O.png'),
  '08-bastos': require('../../assets/cards/8B.png'),
  '08-copas': require('../../assets/cards/8C.png'),
  '08-espadas': require('../../assets/cards/8E.png'),
  '08-oros': require('../../assets/cards/8O.png'),
  '09-bastos': require('../../assets/cards/9B.png'),
  '09-copas': require('../../assets/cards/9C.png'),
  '09-espadas': require('../../assets/cards/9E.png'),
  '09-oros': require('../../assets/cards/9O.png'),
  '10-bastos': require('../../assets/cards/10B.png'),
  '10-copas': require('../../assets/cards/10C.png'),
  '10-espadas': require('../../assets/cards/10E.png'),
  '10-oros': require('../../assets/cards/10O.png'),
  '11-bastos': require('../../assets/cards/11B.png'),
  '11-copas': require('../../assets/cards/11C.png'),
  '11-espadas': require('../../assets/cards/11E.png'),
  '11-oros': require('../../assets/cards/11O.png'),
  '12-bastos': require('../../assets/cards/12B.png'),
  '12-copas': require('../../assets/cards/12C.png'),
  '12-espadas': require('../../assets/cards/12E.png'),
  '12-oros': require('../../assets/cards/12O.png'),
};

const CARD_BACK = require('../../assets/cards/back.png');

export function getCardImage(cardId: string): ReturnType<typeof require> {
  return CARD_IMAGES[cardId] || CARD_BACK;
}

export function getCardBackImage(): ReturnType<typeof require> {
  return CARD_BACK;
}

export default CARD_IMAGES;
