function redact(value) {
  return value
    .replace(/\b(?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>"']+/gi, (address) => {
      try {
        const host = new URL(address.toLowerCase().startsWith('www.') ? 'https://' + address : address).hostname;
        if (!host) return '[link removed]';
        return '[link domain: ' + host.replaceAll('.', '[.]') + ']';
      } catch {
        return '[link removed]';
      }
    })
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[email removed]')
    .replace(/\b(password|passcode|pin|verification code|security code|OTP|account number)\s*[:=]\s*\S+/gi, '$1: [removed]')
    .replace(/\b(?:sk-|lkt_)[a-z\d_-]+/gi, '[secret removed]')
    .replace(/\+?\d(?:[(). -]*\d){6,}/g, '[number removed]');
}

module.exports = { redact };
