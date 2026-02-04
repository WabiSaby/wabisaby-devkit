import React from 'react';
import { ServicesView } from './ServicesView';

export function PluginInfrastructureView() {
  return (
    <ServicesView
      title="Plugin Infrastructure"
      subtitle="Capabilities server and plugin workers."
      emptyTitle="No plugin services found"
      emptySubtitle="Plugin infrastructure services will appear here when available."
      filterGroups={['plugins']}
    />
  );
}
