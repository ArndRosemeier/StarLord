import type { MapScene } from "./scene";

export interface MapInput {
  /** A left or right click on a star; the screen decides whether that selects it or sends the selected fleet. */
  onStar(starId: string, action: "select" | "order"): void;
  /** A click on a fleet; `additive` (shift held) adds it to the selection or takes it out. */
  onFleet(fleetId: string, additive: boolean): void;
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
