class Dictionary {
  constructor(jsonData) {
    this.map = jsonData;
    // Flatten toàn bộ từ trong từ điển để random với xác suất đều (uniform),
    // tránh bias theo số lượng từ ứng với mỗi âm tiết đầu (key)
    this.allWords = [];
    for (const key in jsonData) {
      const entries = jsonData[key] || [];
      for (const word of entries) {
        this.allWords.push(word);
      }
    }
  }

  normalize(str) {
    return String(str || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  firstSyllable(phrase) {
    return this.normalize(phrase).split(' ')[0] || '';
  }

  lastSyllable(phrase) {
    const parts = this.normalize(phrase).split(' ');
    return parts[parts.length - 1] || '';
  }

  isValid(requiredSyllable, phrase, usedPhrases) {
    const key = this.normalize(requiredSyllable);
    const candidate = this.normalize(phrase);
    if (!candidate) return false;
    if (usedPhrases.has(candidate)) return false;
    if (this.firstSyllable(candidate) !== key) return false;
    const entries = this.map[key] || [];
    return entries.some(e => this.normalize(e) === candidate);
  }

  // ✅ Random đều (uniform) trên toàn bộ từ trong từ điển — dùng cho Classic
  getRandomWord() {
    if (this.allWords.length === 0) return '';
    return this.allWords[Math.floor(Math.random() * this.allWords.length)];
  }

  // ✅ Random đều 1 từ, trả về âm tiết đầu (seed) kèm chính từ đó (answer đảm bảo hợp lệ)
  // Dùng cho Blitz — seed luôn có ít nhất 1 đáp án trong từ điển
  getRandomSeedWithAnswer() {
    const answer = this.getRandomWord();
    const seed = this.firstSyllable(answer);
    return { seed, answer };
  }

  // Giữ lại — không dùng nữa trong game-room.js nhưng không xóa để tránh vỡ code khác nếu có gọi
  getRandomPrompt() {
    const keys = Object.keys(this.map);
    if (keys.length === 0) return '';
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const phrases = this.map[randomKey];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }
}

module.exports = Dictionary;