import React from 'react';
import PageHeader from '../components/common/PageHeader';
import './Legal.css';

export default function Terms() {
  return (
    <div className="legal-page">
      <PageHeader 
        eyebrow="Terms"
        title="Terms for Buying Wood and Cutting Work"
        subtitle="Please read these rules before placing an order or bringing logs for cutting. Contact us if anything is unclear."
        breadcrumbs={[{ label: 'Terms of Service' }]}
      />

      <section className="legal-content-section">
        <div className="container">
          <div className="legal-document">
            
            <span className="legal-updated">Last Updated: October 2026</span>

            <p>
              In simple words: these terms explain how we measure wood, handle cutting, store finished wood,
              set prices and take payments. The full terms below apply to orders.
            </p>

            <h2>1. General Terms</h2>
            <p>
              These Terms and Conditions govern all timber sales, log cutting contracts, dimensional timber sizing, 
              and delivery arrangements executed by TimberCraft Saw Mill ("the Mill"). By placing a purchase order 
              or depositing round logs for contract sawing, the Client agrees to be bound by these provisions.
            </p>

            <h2>2. How We Measure Wood</h2>
            <p>
              Volumetric calculations for round timber logs are computed using the internationally recognized 
              <strong>Hoppus Quarter-Girth Formula</strong>: <code>Volume (CBF) = (Girth in inches / 4)² × (Length in feet / 144)</code>.
              This formula estimates log volume using its girth and length. CBF means cubic feet.
              Finished sawn lumber is computed by nominal cross-section multiplied by length: 
              <code>(Thickness" × Width" × Length' × Quantity) / 144</code>.
            </p>
            <p>
              Due to natural log tapers, heart defects, and blade kerf loss (2.5mm to 3.5mm), volumetric yield 
              estimates represent industry-standard projections. The Mill does not guarantee 100% volumetric conversion 
              of raw timber into defect-free clear lumber.
            </p>

            <h2>3. Drying Wood and Changes in Size</h2>
            <p>
              Kiln-dried wood is dried to an average target of 10%–12% equilibrium moisture content (EMC).
              EMC describes the wood's moisture level after drying.
              Wood is a natural, hygroscopic material that absorbs and releases ambient atmospheric humidity. 
              Once dispatched from the Mill, atmospheric fluctuations may cause minor dimensional movement (expansion or shrinkage). 
              The Client is responsible for acclimatizing lumber to final installation environments.
            </p>

            <h2>4. Logs You Bring for Cutting</h2>
            <p>
              Clients depositing private timber logs for contract band sawing must guarantee that logs are free of 
              embedded metal (nails, fencing wire, shrapnel, or stones). Embedded foreign objects that damage 
              industrial stellite band saw blades will incur a replacement blade surcharge billed directly to the Client.
            </p>

            <h2>5. Collecting Wood and Storage Charges</h2>
            <p>
              Finished sawn timber batches must be collected or accepted for site dispatch within 14 calendar days 
              following notice that cutting is complete. After 14 days, a yard storage charge of US$0.15
              per CBF per week applies until collection. CBF means cubic feet.
            </p>

            <h2>6. Prices and Payments</h2>
            <p>
              Formal quotations are valid for 15 calendar days from the date of issuance due to regional raw log market 
              fluctuations. Standard commercial orders require a 50% mobilization deposit upon order confirmation, 
              with the balance payable upon inspection prior to final site dispatch.
            </p>

            <h2>7. Which Laws Apply</h2>
            <p>
              All contracts and commercial disputes arising from timber transactions shall be governed by the laws 
              of the state in which TimberCraft Saw Mill operates.
            </p>

          </div>
        </div>
      </section>
    </div>
  );
}
