function linkClue(address) {
  // Read only the authority, before any path, query, or fragment.
  const authority = address.replace(/^(?:[a-z][a-z\d+.-]*:)?\/\//i, '').split(/[/?#\\]/, 1)[0];
  const host = authority.slice(authority.lastIndexOf('@') + 1)
    .replace(/:\d+$/, '').replace(/\.+$/, '').toLowerCase();
  if (!/^(?:[\p{L}\p{N}.-]+|\[[a-f\d:.]+\])$/u.test(host)) return '[link removed]';
  return '[link domain: ' + host.replaceAll('.', '[.]').replaceAll(':', '[:]') + ']';
}

// One pass keeps an email or a labeled secret inside a URL from splitting it.
const privateText = new RegExp([
  /(\b(?:password|passcode|pin|verification code|security code|OTP|account number))\s*[:=]\s*\S+/.source,
  /(\b[a-z][a-z\d+.-]*:\/\/[^\s<>"']+)/.source,
  /(\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b)/.source,
  /(^|[\s([{<="'\u2018\u201c,;])((?:\/\/)?(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)+(?:xn--[a-z\d-]+|\p{L}{2,})(?![\p{L}\p{N}-])(?::\d+)?(?:[/?#\\][^\s<>"']*)?)/u.source,
].join('|'), 'giu');

function redact(value) {
  return value
    .replace(privateText, (_, secretLabel, url, email, prefix, bareLink) => {
      if (secretLabel) return secretLabel + ': [removed]';
      if (url) return linkClue(url);
      if (email) return '[email removed]';
      return prefix + linkClue(bareLink);
    })
    .replace(/\b(?:sk-|lkt_)[a-z\d_-]+/gi, '[secret removed]')
    .replace(/\+?\d(?:[(). -]*\d){6,}/g, '[number removed]');
}

module.exports = { redact };
