/** The StarLord community board, where players send feedback, bugs and ideas. */
export const CONTACT_URL = "https://board.futuremagic.de/";

/** Opens the community board in a new tab so the running game stays open. */
export function openContact(): void {
  window.open(CONTACT_URL, "_blank", "noopener,noreferrer");
}
