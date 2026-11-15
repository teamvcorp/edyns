import React from "react";

// LEGAL REVIEW REQUIRED before launch (2026-11-14): section 2 covers the
// outside-landlord programs (collecting rent we forward to third-party
// landlords) and the car program (a company-owned vehicle + insurance provided
// for 10% of wages after a trust period, returned if payments stop). Rates come
// from lib/programs.ts; keep this text in sync if they change.

export default function TermsOfService() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>

      <p className="mb-4 text-sm text-gray-600">
        Last Updated: November 14, 2026
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
            income according to the program you enroll in. Every program
            requires the weekly work commitment stated at enrollment.
          </p>

          <h3 className="font-semibold mt-4">The Effort Exchange</h3>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Up to 40% of your wages may be collected</li>
            <li>Funds are exchanged for housing and utilities in a home in our network</li>
            <li>
              <strong>All funds are retained by the company</strong>
            </li>
            <li>No equity, ownership, or savings is created</li>
          </ul>

          <h3 className="font-semibold mt-4">Your Home (with or without the Car Program)</h3>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>30% of your wages is collected for rent, which we pay to the landlord you name</li>
            <li>
              We pay your landlord only from rent we have collected from you. You
              remain responsible to your landlord under your lease, including any
              balance not covered
            </li>
            <li>
              Rent collected beyond what your landlord is owed is <strong>retained by
              the company and is not refundable</strong>. It is credited to your
              available rent funds, which the company may use to cover your future
              rent (for example during a job change) and considers when offering
              you an upgraded home
            </li>
          </ul>

          <h3 className="font-semibold mt-4">Car Program</h3>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>10% of your wages is collected for the Car Program, alone or together with Your Home</li>
            <li>
              <strong>Car Program payments are retained by the company</strong>. They
              are not savings, are not held on your behalf and are not refundable
            </li>
            <li>
              After a trust period of car program payments (normally three months,
              at the company’s discretion) the company provides a vehicle and pays
              its insurance
            </li>
            <li>
              The vehicle remains the property of the company. You must return it if
              your payments stop or you leave the program
            </li>
          </ul>

          <p className="mt-2">
            Third-party processing fees (such as Stripe fees) are added to the
            amounts collected under every program.
          </p>
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