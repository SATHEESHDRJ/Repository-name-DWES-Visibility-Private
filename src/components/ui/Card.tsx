import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', hoverable = false, onClick }: CardProps) {
  const baseStyle = {
  };

  const hoverStyle = hoverable ? {
    cursor: 'pointer',
  } : {};

  return (
    <div
      className={`card ${className}${hoverable ? ' card--hoverable' : ''}`}
      style={{ ...baseStyle, ...hoverStyle }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div
      className={`card-header ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="card-title">{children}</h2>;
}

export function CardBody({ children, className = '' }: CardProps) {
  return (
    <div
      className={`card-body ${className}`}
    >
      {children}
    </div>
  );
}

export function CardBodySm({ children, className = '' }: CardProps) {
  return (
    <div
      className={`card-body-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function CardContent({ children, className = '' }: CardProps) {
  return (
    <div
      className={className}
    >
      {children}
    </div>
  );
}
