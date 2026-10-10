import { useEffect, useState } from "react";
import type { GameSession } from "./game/session";
import { TitleScreen } from "./screens/TitleScreen";
import { NewGame } from "./screens/NewGame";
import { GameShell } from "./screens/GameShell";
import { SessionContext } from "./ui/hooks";
import { audio } from "./audio/sound";

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [setup, setSetup] = useState(false);

  // A soft tick for every button press anywhere in the game.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("button, .title-button");
      if (el && !(el as HTMLButtonElement).disabled) audio.play("click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  if (!session) {
    if (!setup) return <TitleScreen onNewGame={() => setSetup(true)} onStart={setSession} />;
    return <NewGame onStart={setSession} onBack={() => setSetup(false)} />;
  }
  return (
    <SessionContext.Provider value={session}>
      <GameShell onQuit={() => { setSession(null); setSetup(false); }} />
    </SessionContext.Provider>
  );
}
