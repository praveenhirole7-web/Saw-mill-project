import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import SeoMeta from '../components/common/SeoMeta';

export default function NotFoundPage() {
  return (
    <div className="legal-page">
      <SeoMeta
        title="Page not found"
        description="The page you requested does not exist on TimberCraft Saw Mill. Explore our wood products, services, and contact options."
        path="/404"
      />
      <PageHeader
        eyebrow="404"
        title="Page not found"
        subtitle="The page you wanted is not here, but we still have plenty of timber and milling services available."
        breadcrumbs={[{ label: 'Page not found' }]}
      />
      <section className="legal-content-section">
        <div className="container">
          <div className="legal-document" style={{ textAlign: 'center' }}>
            <h2>Let’s get you back on track</h2>
            <p>Try one of the links below to browse timber stock, request a price, or contact the mill team.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '1.5rem' }}>
              <Link to="/products"><Button variant="primary" size="md">Browse wood</Button></Link>
              <Link to="/services"><Button variant="outline" size="md">View services</Button></Link>
              <Link to="/contact"><Button variant="wood" size="md">Contact us</Button></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
