import { useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../game/api';

/** Bild hochladen (über den Worker nach R2) oder entfernen. */
export function ImageUpload({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (url: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await api.uploadImage(file));
    } catch {
      setError(t('editor.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field image-upload">
      <span>{label}</span>
      {value && <img src={value} alt="" />}
      <div className="action-buttons">
        <label className="button-like">
          {busy
            ? t('editor.uploading')
            : value
              ? t('editor.replaceImage')
              : t('editor.uploadImage')}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            disabled={busy}
            onChange={(e) => void pick(e)}
          />
        </label>
        {value && (
          <button type="button" className="link danger-link" onClick={() => onChange(undefined)}>
            {t('editor.removeImage')}
          </button>
        )}
      </div>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
