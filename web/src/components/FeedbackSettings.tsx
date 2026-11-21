import { useState } from "react";
import { playFeedback, readFeedbackPreferences, saveFeedbackPreference } from "../feedback";

export default function FeedbackSettings() {
  const [sound, setSound] = useState(() => readFeedbackPreferences().sound);
  const [haptics, setHaptics] = useState(() => readFeedbackPreferences().haptics);

  function update(key: "sound" | "haptics", value: boolean) {
    if (key === "sound") setSound(value); else setHaptics(value);
    saveFeedbackPreference(key, value);
  }

  return (
    <fieldset className="feedback-settings">
      <legend>Feedback</legend>
      <label className="feedback-setting">
        <span><strong>Sound effects</strong><small>Short tones for completed practice</small></span>
        <input type="checkbox" checked={sound} onChange={(event) => update("sound", event.currentTarget.checked)} />
      </label>
      <label className="feedback-setting">
        <span><strong>Vibration</strong><small>Use device vibration when supported</small></span>
        <input type="checkbox" checked={haptics} onChange={(event) => update("haptics", event.currentTarget.checked)} />
      </label>
      <button type="button" className="ghost feedback-test" onClick={() => playFeedback("complete", { sound, haptics })}>Test feedback</button>
    </fieldset>
  );
}
