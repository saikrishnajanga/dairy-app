import { useState, useEffect } from 'react';
import {
  getTrashItems,
  restoreTrashItem,
  deleteTrashItemPermanently,
  emptyTrash,
  getDaysRemaining,
  type TrashItem,
  type TrashItemType,
} from '../services/trash';
import { TrashIcon, RestoreIcon, BackIcon } from './Icons';
import ConfirmDialog from './ConfirmDialog';
import { hapticTap } from '../services/utils';

interface Props {
  onBack: () => void;
  showToast: (msg: string) => void;
}

export default function TrashScreen({ onBack, showToast }: Props) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [filter, setFilter] = useState<'all' | TrashItemType>('all');
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrashItem | null>(null);

  const loadItems = () => {
    setItems(getTrashItems());
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleRestore = async (item: TrashItem) => {
    hapticTap();
    const ok = await restoreTrashItem(item.id);
    if (ok) {
      showToast(`♻️ Restored "${item.title}"`);
      loadItems();
    } else {
      showToast('⚠️ Could not restore item.');
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    hapticTap();
    const ok = await deleteTrashItemPermanently(deleteTarget.id);
    if (ok) {
      showToast('🗑️ Permanently removed');
      setDeleteTarget(null);
      loadItems();
    } else {
      showToast('⚠️ Failed to delete item.');
    }
  };

  const handleEmptyAll = async () => {
    hapticTap();
    await emptyTrash();
    setConfirmEmpty(false);
    showToast('🗑️ Recycle Bin emptied.');
    loadItems();
  };

  const filteredItems = items.filter(i => filter === 'all' || i.type === filter);

  const counts = {
    all: items.length,
    note: items.filter(i => i.type === 'note').length,
    voice: items.filter(i => i.type === 'voice').length,
    document: items.filter(i => i.type === 'document').length,
  };

  return (
    <div className="trash-screen">
      {/* Top Header */}
      <div className="trash-header">
        <div className="trash-header-left">
          <button
            type="button"
            className="trash-back-btn"
            onClick={onBack}
            title="Go back"
          >
            <BackIcon size={18} />
            <span>Back</span>
          </button>
          <div>
            <h2 className="trash-title">Recycle Bin</h2>
            <p className="trash-subtitle">
              Items are kept here for 30 days before permanent deletion.
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            className="empty-trash-btn"
            onClick={() => setConfirmEmpty(true)}
            title="Permanently remove all items"
          >
            <TrashIcon size={15} />
            <span>Empty Bin</span>
          </button>
        )}
      </div>

      {/* Filter Category Pills */}
      <div className="trash-toolbar">
        <div className="category-pills">
          <button
            type="button"
            className={`category-pill ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            className={`category-pill ${filter === 'note' ? 'active' : ''}`}
            onClick={() => setFilter('note')}
          >
            📝 Notes ({counts.note})
          </button>
          <button
            type="button"
            className={`category-pill ${filter === 'voice' ? 'active' : ''}`}
            onClick={() => setFilter('voice')}
          >
            🎙️ Voice ({counts.voice})
          </button>
          <button
            type="button"
            className={`category-pill ${filter === 'document' ? 'active' : ''}`}
            onClick={() => setFilter('document')}
          >
            📁 Docs ({counts.document})
          </button>
        </div>
      </div>

      {/* List or Empty State */}
      {filteredItems.length === 0 ? (
        <div className="empty-state trash-empty-state">
          <div className="empty-emoji">♻️</div>
          <div className="empty-title">
            {items.length === 0 ? 'Recycle Bin is Empty' : 'No items in this category'}
          </div>
          <div className="empty-desc">
            Deleted notes, voice recordings, and documents will appear here. You can recover them at any time within 30 days.
          </div>
          <button
            type="button"
            className="action-btn"
            onClick={onBack}
            style={{ marginTop: 18 }}
          >
            Return to App
          </button>
        </div>
      ) : (
        <div className="trash-grid">
          {filteredItems.map((item) => {
            const daysLeft = getDaysRemaining(item);
            const isCritical = daysLeft <= 3;
            const isWarning = daysLeft <= 10;

            const typeBadgeText =
              item.type === 'note' ? '📝 Note' :
              item.type === 'voice' ? '🎙️ Voice' : '📄 Doc';

            return (
              <div key={item.id} className="trash-card">
                <div className="trash-card-top">
                  <span className={`trash-type-badge ${item.type}`}>
                    {typeBadgeText}
                  </span>
                  <span
                    className={`trash-expiry-badge ${isCritical ? 'critical' : isWarning ? 'warning' : 'safe'}`}
                    title="Time remaining before auto-purge"
                  >
                    ⏳ {daysLeft === 0 ? 'Purges today' : `${daysLeft} days left`}
                  </span>
                </div>

                <div className="trash-card-content">
                  <h4 className="trash-card-title">{item.title}</h4>
                  <p className="trash-card-preview">{item.preview}</p>
                  <div className="trash-card-date">
                    Deleted {new Date(item.deletedAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>
                </div>

                <div className="trash-card-actions">
                  <button
                    type="button"
                    className="trash-action-btn restore-btn"
                    onClick={() => handleRestore(item)}
                    title="Recover and restore this item"
                  >
                    <RestoreIcon size={15} />
                    <span>Recover</span>
                  </button>

                  <button
                    type="button"
                    className="trash-action-btn delete-btn"
                    onClick={() => setDeleteTarget(item)}
                    title="Delete permanently right now"
                  >
                    <TrashIcon size={15} />
                    <span>Delete Forever</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Empty All Dialog */}
      {confirmEmpty && (
        <ConfirmDialog
          title="Empty Recycle Bin?"
          message={`Are you sure you want to permanently delete all ${items.length} items? This action cannot be reversed.`}
          confirmLabel="Empty Bin"
          onConfirm={handleEmptyAll}
          onCancel={() => setConfirmEmpty(false)}
        />
      )}

      {/* Confirm Single Delete Dialog */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete Permanently?"
          message={`Are you sure you want to permanently remove "${deleteTarget.title}"? You will not be able to recover it.`}
          confirmLabel="Delete Forever"
          onConfirm={handlePermanentDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
