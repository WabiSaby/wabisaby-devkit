import React from 'react';
import { ServicesView } from './ServicesView';

export function MeshServicesView() {
  return (
    <ServicesView
      title="WabiSaby Mesh"
      subtitle="Manage network nodes and the coordinator."
      emptyTitle="No mesh services found"
      emptySubtitle="Mesh services will appear here when available."
      filterGroups={['mesh']}
    />
  );
}
