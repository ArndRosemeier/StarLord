// The contact address is kept scrambled so it never sits in the source or bundle as plain text
// (keeps address-harvesting bots away). It is only assembled when the player asks to write.
const KEY = [0x5a, 0x13, 0x37, 0x2c];
const SCRAMBLED = [82, 119, 116, 79, 94, 116, 59, 65, 82, 97, 47, 88, 66, 117, 26, 72, 69, 124, 54, 94, 86, 103, 41];

function address(): string {
  return SCRAMBLED.slice().reverse().map((c, i) => String.fromCharCode(c ^ KEY[i % KEY.length]!)).join("");
}

/** Opens the player's mail app with a new message to the developer. */
export function openContactMail(version: string): void {
  const subject = encodeURIComponent(`StarLord v${version}`);
  window.location.href = `mailto:${address()}?subject=${subject}`;
}
