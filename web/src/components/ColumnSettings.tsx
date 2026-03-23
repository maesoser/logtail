import { useState } from 'react';
import { Dialog, Checkbox, Button } from '@cloudflare/kumo';
import { GearSixIcon, XIcon } from '@phosphor-icons/react';
import type { ColumnConfig } from '../types';

interface ColumnSettingsProps {
  columns: ColumnConfig[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
  onReset?: () => void;
}

export function ColumnSettings({
  columns,
  onColumnsChange,
  onReset,
}: ColumnSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (key: string) => {
    const newColumns = columns.map(col =>
      col.key === key ? { ...col, visible: !col.visible } : col
    );
    onColumnsChange(newColumns);
  };

  const handleSelectAll = () => {
    const newColumns = columns.map(col => ({ ...col, visible: true }));
    onColumnsChange(newColumns);
  };

  const handleSelectNone = () => {
    // Keep at least timestamp and content visible
    const newColumns = columns.map(col => ({
      ...col,
      visible: col.key === 'timestamp' || col.key === 'content',
    }));
    onColumnsChange(newColumns);
  };

  const visibleCount = columns.filter(c => c.visible).length;

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger 
        render={(props) => (
          <Button {...props} variant="outline" className="flex items-center gap-2">
            <GearSixIcon size={16} />
            Columns ({visibleCount})
          </Button>
        )}
      />
      <Dialog className="p-6" size="sm">
        <div className="flex items-start justify-between gap-4 mb-4">
          <Dialog.Title className="text-xl font-medium text-kumo-default">
            Configure Columns
          </Dialog.Title>
          <Dialog.Close
            render={(props) => (
              <Button
                {...props}
                aria-label="Close"
                variant="secondary"
                shape="square"
                icon={<XIcon size={16} />}
              />
            )}
          />
        </div>
        <Dialog.Description className="text-kumo-subtle mb-4">
          Choose which columns to display in the log table.
        </Dialog.Description>
        
        <div className="py-4">
          <div className="flex gap-2 mb-4">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={handleSelectNone}>
              Select Minimum
            </Button>
            {onReset && (
              <Button variant="outline" size="sm" onClick={onReset}>
                Reset to Defaults
              </Button>
            )}
          </div>
          
          <div className="space-y-3">
            {columns.map(column => (
              <label 
                key={column.key} 
                className="flex items-center gap-3 cursor-pointer"
              >
                <Checkbox
                  checked={column.visible}
                  onCheckedChange={() => handleToggle(column.key)}
                />
                <span className="text-sm flex-1 text-kumo-default">
                  {column.label}
                  {column.monospace && (
                    <span className="ml-2 text-xs text-kumo-inactive">(monospace)</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
        
        <div className="flex justify-end mt-4">
          <Dialog.Close
            render={(props) => (
              <Button {...props} variant="primary">
                Done
              </Button>
            )}
          />
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
