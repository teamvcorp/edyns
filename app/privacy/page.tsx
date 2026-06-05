import React from "react";

export default function PrivacyPolicy() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>

      <p className="mb-4 text-sm text-gray-600">
        Last Updated: June 5, 2026
      </p>

      <section className="space-y-6 text-gray-800">
        <p>
          This Privacy Policy describes how we collect, use, disclose, and
          protect your personal information when you use our platform and
          services.
        </p>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            1. Service Model Disclosure
          </h2>
          <p>
            Our platform operates a financial and housing model in which a
            portion of your income is allocated in exchange for housing and
            utility services.
          </p>

          <ul className="list-disc list-inside mt-3 space-y-1">
            <li>
              You agree that up to <strong>40% of your income</strong> may be
              collected.
            </li>
            <li>
              These funds are exchanged for housing accommodations and utilities.
            </li>
            <li>
              <strong>All collected proceeds are retained by the company</strong> and
              are not held in trust, savings, or investment on your behalf.
            </li>
            <li>
              Participation is voluntary and based on your agreement to these terms.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            2. Information We Collect
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Identity data (name, DOB, address)</li>
            <li>Employment and wage information</li>
            <li>Banking and payroll integration data</li>
            <li>Housing usage and service data</li>
            <li>Device and analytics data</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            3. Legal Basis for Processing
          </h2>
          <p>We process your data based on:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Your consent</li>
            <li>Performance of a contract (housing + financial services)</li>
            <li>Legal obligations</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            4. Financial & Wage Processing
          </h2>
          <p>
            We may connect to payroll providers and financial institutions to
            verify wages and facilitate allocations.
          </p>

          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Automatic or manual wage deductions</li>
            <li>Income verification</li>
            <li>Fund collection and processing</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            5. How We Use Information
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Provide housing and utilities</li>
            <li>Manage payments and services</li>
            <li>Improve platform performance</li>
            <li>Prevent fraud and abuse</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            6. Data Sharing
          </h2>
          <p>We may share data with:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Payment processors and banks</li>
            <li>Housing providers</li>
            <li>Legal/regulatory authorities</li>
          </ul>
          <p className="mt-2">We do not sell personal data.</p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            7. Risks & Disclosures
          </h2>
          <p>
            By using the platform, you acknowledge:
          </p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>No savings or ownership is created from payments</li>
            <li>Funds paid are not recoverable unless explicitly stated</li>
            <li>Service access may depend on continued payment participation</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            8. Data Retention
          </h2>
          <p>
            We retain your data as long as necessary to provide services and comply
            with legal obligations.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            9. Your Rights
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Access your data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion (subject to law)</li>
            <li>Withdraw consent</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            10. Security
          </h2>
          <p>
            We use industry-standard safeguards but cannot guarantee absolute
            security.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            11. Changes
          </h2>
          <p>
            We may update this policy. Continued use means acceptance of updates.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            12. Contact
          </h2>
          <p>Email: support@yourcompany.com</p>
        </div>
      </section>
    </main>
  );
}
