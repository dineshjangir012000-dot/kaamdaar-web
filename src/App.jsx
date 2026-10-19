import { useRef, useState } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { auth } from "./firebase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function App() {
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);

  const [phoneVerified, setPhoneVerified] = useState(false);
  const [nextStep, setNextStep] = useState("");

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
        {
          size: "invisible",
        },
      );
    }

    return recaptchaRef.current;
  };

  // Step 1: Send an OTP using Firebase.

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setMessage("");

    // Remove spaces, hyphens, and parentheses.
    const normalizedMobile = mobile.trim().replace(/[\s()-]/g, "");

    if (!/^\+[1-9]\d{7,14}$/.test(normalizedMobile)) {
      setMessage("Enter a valid mobile number with country code.");
      return;
    }

    setLoading(true);

    try {
      const apiResponse = await fetch(`${API_BASE_URL}/auth/otp/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mobile: normalizedMobile,
        }),
      });

      const apiResult = await apiResponse.json();

      if (!apiResponse.ok) {
        setMessage(apiResult.error?.message || "Unable to request OTP.");
        return;
      }

      // Firebase receives the normalized number in E.164 format.
      const verifier = setupRecaptcha();

      const confirmation = await signInWithPhoneNumber(
        auth,
        normalizedMobile,
        verifier,
      );

      setConfirmationResult(confirmation);
      setMobile(normalizedMobile);
      setOtp("");
      setMessage("OTP sent successfully. Enter the six-digit code.");
    } catch (error) {
      console.error("OTP request failed:", error.code || error.message);
      setMessage(error.message || "Unable to send OTP. Please try again.");

      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify the OTP and ask the backend what to do next.
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
      // Verify the phone number with Firebase.
      const credential = await confirmationResult.confirm(otp);

      const idToken = await credential.user.getIdToken();

      console.log("Firebase ID Token:", idToken);

      const firebaseUser = credential.user;

      // Ask the backend whether this customer needs registration or login.
      const response = await fetch(`${API_BASE_URL}/auth/continue`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          result.error?.message || "Unable to continue. Please try again.",
        );
        return;
      }

      const step = result.data?.next_step;

      if (step !== "REGISTER" && step !== "LOGIN") {
        setMessage("The server returned an unexpected response.");
        return;
      }

      setPhoneVerified(true);
      setNextStep(step);

      if (step === "REGISTER") {
        setMessage("Phone verified! Complete your customer registration.");
      } else {
        setMessage("Your account already exists. Welcome back!");
      }
    } catch (error) {
      console.error(
        "OTP verification or account check failed:",
        error.code || error.message,
      );

      setMessage(
        "Verification failed or the server could not be reached. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Register a new customer.
  const handleRegister = async (e) => {
    e.preventDefault();
    setMessage("");

    const firebaseUser = auth.currentUser;

    if (!firebaseUser || !phoneVerified || nextStep !== "REGISTER") {
      setMessage("Please verify your mobile number first.");
      return;
    }

    if (name.trim().length < 2) {
      setMessage("Please enter your full name.");
      return;
    }

    if (!acceptedTerms || !acceptedPrivacy) {
      setMessage("Accept the Terms and acknowledge the Privacy Policy.");
      return;
    }

    setLoading(true);

    try {
      const idToken = await firebaseUser.getIdToken();

      const response = await fetch(`${API_BASE_URL}/auth/register/customer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          acceptedTerms,
          acceptedPrivacy,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(
          result.error?.message ||
            "Customer registration failed. Please try again.",
        );
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

  const handleCustomerLogin = async () => {
    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      setMessage("Please verify your mobile number first.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const idToken = await firebaseUser.getIdToken();

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          deviceName: "Kaamdaar Web",
        }),
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error?.message || "Login failed.");
        return;
      }

      // Keep the short-lived access token in application state
      // when we implement the shared authentication context.
      console.log("Customer login successful:", result.data.customer);

      setMessage("Login successful! Customer home page is next.");
    } catch (error) {
      console.error("Customer login failed:", error.message);
      setMessage("Unable to reach the backend.");
    } finally {
      setLoading(false);
    }
  };

  // Reset the current phone-verification flow.
  const handleStartOver = async () => {
    setMessage("");
    setMobile("");
    setOtp("");
    setConfirmationResult(null);
    setPhoneVerified(false);
    setNextStep("");
    setName("");
    setEmail("");
    setAcceptedTerms(false);
    setAcceptedPrivacy(false);
    setRegistrationComplete(false);

    try {
      if (auth.currentUser) {
        await auth.signOut();
      }
    } catch (error) {
      console.error("Firebase sign-out failed:", error.message);
    }

    recaptchaRef.current?.clear();
    recaptchaRef.current = null;
  };

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <h1 style={styles.heading}>Kaamdaar</h1>
        <p style={styles.subtitle}>
          Register or sign in using your mobile number.
        </p>

        {/* Phone number and OTP forms */}
        {!phoneVerified && (
          <>
            <form onSubmit={handleSendOtp} style={styles.form}>
              <label htmlFor="mobile">Mobile number with country code</label>

              <input
                id="mobile"
                type="tel"
                placeholder="+919876543210"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                disabled={loading || Boolean(confirmationResult)}
                autoComplete="tel"
                required
                style={styles.input}
              />

              {!confirmationResult && (
                <button type="submit" disabled={loading} style={styles.button}>
                  {loading ? "Please wait..." : "Send OTP"}
                </button>
              )}
            </form>

            <div id="recaptcha-container" style={styles.recaptcha} />


            {confirmationResult && (
              <form onSubmit={handleVerifyOtp} style={styles.form}>
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
                  style={styles.input}
                />

                <button type="submit" disabled={loading} style={styles.button}>
                  {loading ? "Verifying..." : "Verify OTP"}
                </button>

                <button
                  type="button"
                  onClick={handleStartOver}
                  disabled={loading}
                  style={styles.secondaryButton}
                >
                  Change mobile number
                </button>
              </form>
            )}
          </>
        )}

        {/* Registration form: only for new customers */}
        {phoneVerified && nextStep === "REGISTER" && !registrationComplete && (
          <form onSubmit={handleRegister} style={styles.form}>
            <h2 style={styles.subheading}>Complete your registration</h2>

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
              style={styles.input}
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
              style={styles.input}
            />

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                required
              />
              <span>I accept the Terms of Use.</span>
            </label>

            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={(e) => setAcceptedPrivacy(e.target.checked)}
                required
              />
              <span>I acknowledge the Privacy Policy.</span>
            </label>

            <button type="submit" disabled={loading} style={styles.button}>
              {loading ? "Registering..." : "Create Customer Account"}
            </button>

            <button
              type="button"
              onClick={handleStartOver}
              disabled={loading}
              style={styles.secondaryButton}
            >
              Start over
            </button>
          </form>
        )}

        {/* Existing customer: login/session flow is the next implementation step */}
        {phoneVerified && nextStep === "LOGIN" && (
          <div style={styles.form}>
            <h2 style={styles.subheading}>Welcome back!</h2>
            <p>Your mobile number is verified and an account already exists.</p>
            <p style={styles.note}>
              The backend login/session API still needs to be connected before
              you can enter your customer account.
            </p>

            <button
              type="button"
              onClick={handleStartOver}
              disabled={loading}
              style={styles.button}
            >
              Back to mobile verification
            </button>
          </div>
        )}

        {/* Registration success */}
        {registrationComplete && (
          <div style={styles.form}>
            <h2 style={styles.subheading}>Registration successful!</h2>
            <p>Your Kaamdaar customer account has been created.</p>
            <p style={styles.note}>
              The next step is to connect the customer address flow or navigate
              to the customer home page.
            </p>
          </div>
        )}

        {message && (
          <p role="status" aria-live="polite" style={styles.message}>
            {message}
          </p>
        )}
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
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: "440px",
    background: "#fff",
    padding: "28px",
    borderRadius: "12px",
    boxShadow: "0 4px 18px rgba(0,0,0,0.08)",
    boxSizing: "border-box",
  },
  heading: {
    margin: "0 0 8px",
    textAlign: "center",
  },
  subtitle: {
    textAlign: "center",
    color: "#6b7280",
    marginBottom: "24px",
  },
  subheading: {
    margin: "8px 0",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  input: {
    width: "100%",
    padding: "11px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    boxSizing: "border-box",
    fontSize: "15px",
  },
  button: {
    padding: "12px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "15px",
  },
  secondaryButton: {
    padding: "10px",
    background: "#fff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "14px",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    margin: "4px 0",
  },
  recaptcha: {
    margin: "12px 0",
  },
  message: {
    marginTop: "18px",
    padding: "10px",
    background: "#f3f4f6",
    borderRadius: "6px",
    overflowWrap: "anywhere",
  },
  note: {
    color: "#6b7280",
    fontSize: "14px",
    lineHeight: 1.5,
  },
};

export default App;
