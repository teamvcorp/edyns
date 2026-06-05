import React from "react";

export default function TermsOfService() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>

      <p className="mb-4 text-sm text-gray-600">
        Last Updated: June 5, 2026
      </p>

      <section className="space-y-6 text-gray-800">
        <div>
          <h2 className="text-xl font-semibold mb-2">1. Agreement</h2>
          <p>
            By accessing or using our platform, you agree to be bound by these
            Terms of Service.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            2. Financial & Housing Model
          </h2>
          <p>
            You agree that participation in the service includes allocation of
            income in exchange for housing and related services.
          </p>

          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Up to 40% of your wages may be collected</li>
            <li>Funds are exchanged for housing and utilities</li>
            <li>
              <strong>All funds are retained by the company</strong>
            </li>
            <li>No equity, ownership, or savings is created</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            3. User Responsibilities
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Provide accurate financial and identity data</li>
            <li>Maintain payment obligations</li>
            <li>Comply with housing rules and conduct standards</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            4. Payments & Authorization
          </h2>
          <p>
            You authorize us to access payroll or banking systems to facilitate
            payments and wage allocation.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            5. Termination
          </h2>
          <p>
            We may suspend or terminate services at our discretion for violations
            of these terms or non-payment.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            6. No Financial Advice
          </h2>
          <p>
            Our services do not constitute financial, legal, or investment advice.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            7. Limitation of Liability
          </h2>
          <p>
            To the fullest extent permitted by law, we are not liable for indirect,
            incidental, or consequential damages.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            8. Risk Acknowledgment
          </h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Payments are not recoverable</li>
            <li>No ownership rights are created</li>
            <li>Access to housing depends on active participation</li>
          </ul>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            9. Modifications
          </h2>
          <p>
            We may update these terms. Continued use constitutes acceptance.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            10. Governing Law
          </h2>
          <p>
            These terms are governed by applicable laws in your jurisdiction.
          </p>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">
            11. Contact
          </h2>
          <p>Email: support@yourcompany.com</p>
        </div>
      </section>
    </main>
  );
}