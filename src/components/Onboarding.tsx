import { setSettings } from "~/state/settings";
import { ProfileEditor } from "./ProfileEditor";

/**
 * First-launch onboarding: declare your method once, so the solve checker
 * knows what "correct" means for you. Everything can be changed later in
 * Settings.
 */
export function Onboarding() {
  return (
    <div class="card onboarding">
      <h2>Welcome — tell the timer how you solve</h2>
      <p class="muted">
        This sets your letter scheme, your orientation and the optional automatic analysis. Pick what you use —
        you can change all of this later in Settings.
      </p>
      <ProfileEditor />
      <div class="onboarding-actions">
        <button class="primary" onClick={() => setSettings("profile", "onboarded", true)}>
          Save & start solving
        </button>
      </div>
    </div>
  );
}
