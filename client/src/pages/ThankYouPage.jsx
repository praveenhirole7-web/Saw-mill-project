import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import SeoMeta from '../components/common/SeoMeta';

export default function ThankYouPage() {
  return (
    <div className="legal-page">
      <SeoMeta
        title="Thank you"
        description="Thank you for contacting TimberCraft Saw Mill. We have received your message and will get back to you soon."
        path="/thank-you"
      />
      <PageHeader
        eyebrow="Message received"
        title="Thank you for contacting us"
        subtitle="Our team has received your enquiry and will follow up shortly."
        breadcrumbs={[{ label: 'Thank you' }]}
      />
      <section className="legal-content-section">
        <div className="container">
          <div className="legal-document" style={{ textAlign: 'center' }}>
            <CheckCircle2 size={52} color="#137333" style={{ marginBottom: '1rem' }} />
            <h2>Your enquiry was submitted successfully</h2>
            <p>We will review your request and contact you as soon as possible. In the meantime, you can continue browsing our wood stock and services.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <Link to="/products"><Button variant="primary" size="md">See available wood</Button></Link>
              <Link to="/services"><Button variant="outline" size="md">Explore services</Button></Link>
              <Link to="/contact"><Button variant="wood" size="md">Send another message</Button></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
