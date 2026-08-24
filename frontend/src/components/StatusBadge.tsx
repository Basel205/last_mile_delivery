import React from 'react';

const STATUS_STYLES: Record<string, string> = {
  CREATED:         'border-slate-400 text-slate-600',
  PICKED_UP:       'border-blue-500 text-blue-600',
  IN_TRANSIT:      'border-amber-500 text-amber-600',
  OUT_FOR_DELIVERY:'border-orange-500 text-orange-600',
  DELIVERED:       'border-teal-600 text-teal-700',
  FAILED:          'border-red-500 text-red-600',
  CANCELLED:       'border-gray-400 text-gray-500',
  RESCHEDULED:     'border-purple-500 text-purple-600',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'border-gray-400 text-gray-500';
  return (
    <span className={`inline-block text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full border -rotate-1 whitespace-nowrap ${style}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
