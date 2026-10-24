import { useEffect, useState } from "react";
import type { GameSession } from "./game/session";
import { TitleScreen } from "./screens/TitleScreen";
import { NewGame } from "./screens/NewGame";
import { GameShell } from "./screens/GameShell";
import { SessionContext } from "./ui/hooks";
import { audio } from "./audio/sound";
import { HelpProvider } from "./help/HelpDialog";
import { TouchTips } from "./ui/TouchTips";
import { ConfirmHost } from "./ui/confirm";
import { OnlineScreen, roomFromUrl, setRoomInUrl } from "./screens/OnlineScreen";

export function App() {
  const [session, setSession] = useState<GameSession | null>(null);
  const [setup, setSetup] = useState<{ raceId?: string } | null>(null);
  // A ?room=CODE link opens the online screen and joins that room.
  const [online, setOnline] = useState<{ code: string | null } | null>(() => {
    const code = roomFromUrl();
    return code ? { code } : null;
  });

  // A soft tick for every button press anywhere in the game.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest("button, .title-button");
      if (el && !(el as HTMLButtonElement).disabled) audio.play("click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <HelpProvider session={session}>
      {!session ? (
        online ? <OnlineScreen joinCode={online.code} onStart={setSession} onBack={() => setOnline(null)} />
          : !setup ? <TitleScreen onNewGame={(raceId) => setSetup({ raceId })} onStart={setSession} onOnline={() => setOnline({ code: null })} />
          : <NewGame initialRace={setup.raceId} onStart={setSession} onBack={() => setSetup(null)} />
      ) : (
        <SessionContext.Provider value={session}>
          <GameShell onQuit={() => {
            if (session.online) {
              session.online.close();
              setRoomInUrl(null);
            }
            setSession(null);
            setSetup(null);
            setOnline(null);
          }} />
        </SessionContext.Provider>
      )}
      <TouchTips />
      <ConfirmHost />
    </HelpProvider>
  );
}
