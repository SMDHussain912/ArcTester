"use client";

import { useRouter } from "next/navigation";
import { useSession } from "./session";

/** Top bar showing who is signed in, with a sign-out button. */
export function SessionBar() {
  const router = useRouter();
  const { status, user, signOut } = useSession();

  if (status === "loading") {
    return (
      <div className="bar">
        <span className="mute">Checking session…</span>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="bar">
        <span className="mute">Not signed in</span>
        <a href="/login">
          <button className="alt">Sign in</button>
        </a>
      </div>
    );
  }

  return (
    <div className="bar">
      <span className="mute">
        Signed in as <b>{user?.email}</b>
      </span>
      <button
        className="alt"
        onClick={() => {
          void signOut().then(() => router.push("/login"));
        }}
      >
        Sign out
      </button>
    </div>
  );
}