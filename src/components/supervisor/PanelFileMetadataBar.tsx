import type { PanelFileMetadata } from './panelFilePopup';
import { formatFileSize, formatUploadedAt } from './panelFilePopup';

interface PanelFileMetadataBarProps {
  metadata: PanelFileMetadata;
  className?: string;
}

/** Read-only file metadata strip for wiring / drawing popups. */
export default function PanelFileMetadataBar({ metadata, className = '' }: PanelFileMetadataBarProps) {
  return (
    <dl className={`panel-file-metadata ${className}`.trim()} aria-label="Uploaded file details">
      <div className="panel-file-metadata-item">
        <dt>File</dt>
        <dd title={metadata.fileName}>{metadata.fileName}</dd>
      </div>
      <div className="panel-file-metadata-item">
        <dt>Type</dt>
        <dd>{metadata.fileType}</dd>
      </div>
      {metadata.sheetName && (
        <div className="panel-file-metadata-item">
          <dt>Sheet</dt>
          <dd>{metadata.sheetName}</dd>
        </div>
      )}
      <div className="panel-file-metadata-item">
        <dt>Uploaded</dt>
        <dd>{formatUploadedAt(metadata.uploadedAt)}</dd>
      </div>
      <div className="panel-file-metadata-item">
        <dt>By</dt>
        <dd>{metadata.uploadedBy || '—'}</dd>
      </div>
      <div className="panel-file-metadata-item">
        <dt>Size</dt>
        <dd>{formatFileSize(metadata.sizeBytes)}</dd>
      </div>
    </dl>
  );
}
