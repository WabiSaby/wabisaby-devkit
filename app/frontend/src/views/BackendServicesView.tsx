import React from 'react';
import { ServicesView } from './ServicesView';
import { MigrationsPanel } from '../components/MigrationsPanel';

export function BackendServicesView() {
  return (
    <ServicesView
      title="Backend Services"
      subtitle="Run core backend services and manage database migrations."
      emptyTitle="No backend services found"
      emptySubtitle="Backend services will appear here when available."
      filterGroups={['backend']}
      extraSections={<MigrationsPanel />}
      extraSectionsPosition="bottom"
    />
  );
}
