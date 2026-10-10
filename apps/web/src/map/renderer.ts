import type { MapScene } from "./scene";

export interface MapInput {
  /** Left click on a star selects it; right click orders the selected fleet there. */
  onStar(starId: string, action: "select" | "order"): void;
  onFleet(fleetId: string): void;
  onBackground(): void;
}

/**
 * The galaxy map behind an interface, so the 2D PixiJS map can later be
 * swapped for a 3D one drawn on a plane without touching the screens.
 */
export interface MapRenderer {
  mount(container: HTMLElement, input: MapInput): Promise<void>;
  render(scene: MapScene): void;
  /** Centre the camera on galaxy coordinates. */
  focus(x: number, y: number): void;
  destroy(): void;
}
