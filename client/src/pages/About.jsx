import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import './About.css';

export default function About() {
  return (
    <div className="about-page">
      <PageHeader
        eyebrow="About"
        title="About Our Saw Mill"
        subtitle="Find wood for sale, ask about cutting work, or contact our mill team."
        breadcrumbs={[{ label: 'About' }]}
      />
      <section className="section">
        <div className="container text-center">
          <h2 className="section-title">About the Mill</h2>
          <p className="section-subtitle">
            More details about the mill, its certificates and the work it can do are not listed here yet.
            Contact us for the latest information.
          </p>
          <Link to="/contact">
            <Button variant="primary" size="md" icon={<ArrowRight size={16} />}>Send a Message</Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
