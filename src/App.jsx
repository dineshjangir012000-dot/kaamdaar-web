import { useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { auth } from "./firebase";

function App() {
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const recaptchaRef = useRef(null);

  // Initialize Firebase reCAPTCHA.
  const setupRecaptcha = () => {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        { size: "normal" },
      );
    }

    return recaptchaRef.current;
  };

  // Step 1: Request an OTP.
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!/^\+[1-9]\d{7,14}$/.test(mobile)) {
      setMessage("Enter a valid mobile number with country code.");
      return;
    }

    setLoading(true);

    try {
      const verifier = setupRecaptcha();
      await verifier.render();

      const result = await signInWithPhoneNumber(auth, mobile, verifier);

      setConfirmationResult(result);
      setMessage("OTP request successful. Enter your verification code.");
    } catch (error) {
      console.error("OTP request failed:", error.code);
      setMessage(error.message || "Unable to request OTP.");

      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify the OTP through Firebase.
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!confirmationResult) {
      setMessage("Please request an OTP first.");
      return;
    }

    if (!/^\d{6}$/.test(otp)) {
      setMessage("Enter the six-digit verification code.");
      return;
    }

    setLoading(true);

    try {
      const credential = await confirmationResult.confirm(otp);
      const idToken = await credential.user.getIdToken();

      console.log("Firebase user verified:", credential.user.uid);
      console.log("Firebase ID token received:", Boolean(idToken));

      setPhoneVerified(true);
      setMessage("Phone verified! Complete your registration.");
    } catch (error) {
      console.error("OTP verification failed:", error.code);
      setMessage("Verification failed. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Register the customer in the Kaamdaar backend.
  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");

    const firebaseUser = auth.currentUser;

    if (!firebaseUser || !phoneVerified) {
      setMessage("Please verify your mobile number first.");
      return;
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      setMessage("Accept the Terms and acknowledge the Privacy Policy.");
      return;
    }

    setLoading(true);

    try {
      const idToken = await firebaseUser.getIdToken();

      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL}/auth/register/customer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            name,
            email,
            acceptedTerms,
            acceptedPrivacy,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error?.message || "Customer registration failed.");
        return;
      }

      setRegistrationComplete(true);
      setMessage(result.message || "Customer registered successfully.");

      console.log("Registered customer:", result.data?.customer);
    } catch (error) {
      console.error("Registration request failed:", error.message);
      setMessage("Unable to reach the backend. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1>Kaamdaar</h1>
        <p>Register or sign in using your mobile number.</p>

        {!phoneVerified && (
          <>
            <form onSubmit={handleSendOtp}>
              <label htmlFor="mobile">Mobile number with country code</label>

              <input
                id="mobile"
                type="tel"
                placeholder="+16505553434"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                disabled={loading || Boolean(confirmationResult)}
                autoComplete="tel"
                required
              />

              {!confirmationResult && (
                <button type="submit" disabled={loading}>
                  {loading ? "Please wait..." : "Send OTP"}
                </button>
              )}
            </form>

            <div id="recaptcha-container"></div>

            {confirmationResult && (
              <form onSubmit={handleVerifyOtp}>
                <label htmlFor="otp">Verification code</label>

                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter six-digit code"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />

                <button type="submit" disabled={loading}>
                  {loading ? "Verifying..." : "Verify OTP"}
                </button>
              </form>
            )}
          </>
        )}

        {phoneVerified && !registrationComplete && (
          <form onSubmit={handleRegister}>
            <h2>Complete your registration</h2>

            <label htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              minLength={2}
              autoComplete="name"
              required
            />

            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              autoComplete="email"
              required
            />

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />
              I accept the Terms of Use.
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                required
              />
              I acknowledge the Privacy Policy.
            </label>

            <button type="submit" disabled={loading}>
              {loading ? "Registering..." : "Create Customer Account"}
            </button>
          </form>
        )}

        {registrationComplete && (
          <div>
            <h2>Registration successful!</h2>
            <p>Your Kaamdaar customer account has been created.</p>
          </div>
        )}

        {message && <p role="status">{message}</p>}
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    background: "#f3f4f6",
    padding: "20px",
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "#fff",
    padding: "28px",
    borderRadius: "12px",
    boxShadow: "0 4px 18px rgba(0,0,0,0.08)",
    boxSizing: "border-box",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: "14px 0",
  },
};

export default App;
