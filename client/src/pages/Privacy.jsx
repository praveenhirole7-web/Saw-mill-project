import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import './Legal.css';

export default function Privacy() {
  return (
    <div className="legal-page">
      <PageHeader 
        eyebrow="Legal & Compliance"
        title="Privacy Policy"
        subtitle="How TimberCraft Saw Mill collects, protects, and handles commercial procurement and timber inquiry data."
        breadcrumbs={[{ label: 'Privacy Policy' }]}
      />

      <section className="legal-content-section">
        <div className="container">
          <div className="legal-document">
            
            <span className="legal-updated">Last Updated: October 2026</span>

            <h2>1. Information We Collect</h2>
            <p>
              TimberCraft Saw Mill ("we," "our," or "the Mill") collects information provided directly by clients, 
              contractors, and procurement officers when requesting timber quotations, booking sawing carriage time, 
              or registering purchase orders. This information includes:
            </p>
            <ul>
              <li><strong>Contact Information:</strong> Full name, company or trading name, physical dispatch address, phone number, and email.</li>
              <li><strong>Project & Architectural Specifications:</strong> Wood species selections, dimensional measurements (thickness, width, length), volumetric estimates (Cubic Feet / CBF), and architectural blueprints.</li>
              <li><strong>Billing & Commercial Identifiers:</strong> Tax/GST registration numbers, purchase order references, and invoicing records.</li>
            </ul>

            <h2>2. Purpose of Data Processing</h2>
            <p>
              We process client data strictly for standard commercial operations, including:
            </p>
            <ul>
              <li>Calculating exact volumetric Hoppus recovery yields and dispatching formal price quotations.</li>
              <li>Scheduling log blade breakdown on our band saw carriages and kiln seasoning bays.</li>
              <li>Coordinating heavy transport flatbeds, site delivery cranes, and logistics dispatch.</li>
              <li>Complying with forestry department transit permits and legal timber origin documentation.</li>
            </ul>

            <h2>3. Timber Forestry & Regulatory Compliance</h2>
            <p>
              Timber procurement is subject to federal and state forestry regulations. We maintain records of log species, 
              transit passes, and legal harvest permits as mandated by regional forest conservation authorities. 
              We never sell, rent, or trade client procurement data to third-party marketing companies.
            </p>

            <h2>4. Data Storage & Security</h2>
            <p>
              All quotation submissions and customer records are stored on secure internal databases protected by 
              industry-standard encryption and role-based access controls. Only authorized yard coordinators 
              and accounting personnel have access to commercial project data.
            </p>

            <h2>5. Contacting Our Data Officer</h2>
            <p>
              For privacy-related questions, submit a message through the <Link to="/contact">contact form</Link>.
            </p>

          </div>
        </div>
      </section>
    </div>
  );
}
