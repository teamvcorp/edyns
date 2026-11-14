import React from "react";

// LEGAL REVIEW REQUIRED before launch (2026-11-14): section 2 now covers the
// own-landlord (30% rent + 10% car) and car-savings (10%) programs — collecting
// rent we forward to third-party landlords and holding car savings. Rates come
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

          <h3 className="font-semibold mt-4">Your Home + Car</h3>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>30% of your wages is collected for rent, which we pay to the landlord you name</li>
            <li>
              We pay your landlord only from rent we have collected from you. You
              remain responsible to your landlord under your lease, including any
              balance not covered
            </li>
            <li>10% of your wages is collected as car savings (see below)</li>
          </ul>

          <h3 className="font-semibold mt-4">Car Savings</h3>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>10% of your wages is collected as car savings</li>
          </ul>

          <h3 className="font-semibold mt-4">About car savings</h3>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Car savings are held by the company. They are not a bank or deposit account in your name and do not earn interest</li>
            <li>Car savings are released only toward a vehicle purchase approved by the company under program rules</li>
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
            <li>Payments are not recoverable, except car savings released under program rules</li>
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