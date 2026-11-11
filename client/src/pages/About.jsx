import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import Button from '../components/common/Button';
import SeoMeta from '../components/common/SeoMeta';
import './About.css';

const points = [
  'Wood for homes, shops, builders, and furniture work.',
  'Simple pricing and clear information for farmers and customers.',
  'Support for custom cutting and wood supply as needed.'
];

export default function About() {
  return (
    <div className="about-page">
      <SeoMeta
        title="About TimberCraft Saw Mill"
        description="Learn about TimberCraft Saw Mill, our timber supply services, and the custom milling expertise we bring to builders and trade clients."
        path="/about"
      />
      <PageHeader
        eyebrow="About"
        title="About Our Saw Mill"
        subtitle="We help farmers and customers buy good wood, get the right size, and get quick support."
        breadcrumbs={[{ label: 'About' }]}
      />
      <section className="section">
        <div className="container">
          <div className="simple-card simple-card--wide">
            <h2 className="section-title">Simple and honest service</h2>
            <p className="section-subtitle">
              TimberCraft helps people find wood, check stock, and request custom cutting in a simple way.
              We focus on clear communication and fair prices.
            </p>

            <div className="simple-list">
              {points.map((item) => (
                <div key={item} className="simple-list__item">
                  <CheckCircle2 size={18} />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="simple-actions">
              <Link to="/products">
                <Button variant="primary" size="md" icon={<ArrowRight size={16} />}>See wood for sale</Button>
              </Link>
              <Link to="/contact">
                <Button variant="outline" size="md">Contact us</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
