import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import './Services.css';

export default function Services() {
  return (
    <div className="services-page">
      <PageHeader
        eyebrow="Mill Services"
        title="Wood Cutting and Supply"
        subtitle="Tell us what wood or cutting work you need. Our team will confirm what is available and the price."
        breadcrumbs={[{ label: 'Services' }]}
      />
      <section className="services-list-section">
        <div className="container">
          <div className="products-empty-state">
            <h2>Ask Us About Our Services</h2>
            <p>
              Service details, prices and available dates are not listed here yet. Tell us what you need and
              our team will get back to you.
            </p>
            <Link to="/quote">
              <Button variant="primary" size="md" icon={<ArrowRight size={16} />}>
                Ask About a Service
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
