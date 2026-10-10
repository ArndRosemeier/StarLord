import { useState } from "react";
import type { GameSession } from "./game/session";
import { NewGame } from "./screens/NewGame";
import { GameShell } from "./screens/GameShell";
import { SessionContext } from "./ui/hooks";

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  if (!session) return <NewGame onStart={setSession} />;
  return (
    <SessionContext.Provider value={session}>
      <GameShell onQuit={() => setSession(null)} />
    </SessionContext.Provider>
  );
}
