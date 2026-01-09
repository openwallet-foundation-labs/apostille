export default function PrivacyPolicy() {
  return (
    <>
      <h1>Esse Privacy Policy</h1>

      <p>
        <strong>Effective date:</strong> 22 July 2025
      </p>

      <p>
        Esse (“we”, “us”, “our”) is an open-source, non-custodial Self-Sovereign Identity (SSI) wallet.  
        We do <strong>not</strong> have access to your private keys, credentials, or any other personal data stored on your device.
      </p>

      <h2>1. Information We Collect</h2>
      <ul>
        <li><strong>No personal data is collected or stored by us.</strong></li>
        <li><strong>Locally on your device:</strong> cryptographic keys, DIDs, verifiable credentials, and connection metadata.</li>
      </ul>

      <h2>2. Analytics</h2>
      <ul>
        <li>Crash logs (<strong>retained for 90 days</strong>).</li>
      </ul>

      <h2>3. Third Parties</h2>
      <p>
        We share no personal data with third parties. Public DIDs and cryptographic proofs are published to distributed ledgers as required by SSI protocols.
      </p>

      <h2>4. Data Retention</h2>
      <p>
        All wallet data remains on your device until you delete it.
      </p>

      <h2>5. Your Rights</h2>
      <p>
        Because we do not host your data, exercising the right of access or erasure is accomplished by exporting or deleting the wallet locally.
      </p>

      <h2>6. Security</h2>
      <p>
        Private keys are encrypted using the device’s secure hardware (Android Keystore / iOS Keychain) and require biometric or PIN authentication.
      </p>

      <h2>7. Children</h2>
      <p>
        The app is not intended for users under 13.
      </p>

      <h2>8. Changes</h2>
      <p>
        Any changes to this policy will be posted here with a new effective date.
      </p>

      <h2>9. Contact</h2>
      <p>
        <a href="mailto:contact@example.com">contact@example.com</a>
      </p>
    </>
  );
}