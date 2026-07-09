import { useEffect } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import ProductionBootstrapModal from './ProductionBootstrapModal';

interface Props {
  children: React.ReactNode;
}

/** Blocks dashboard access until production bootstrap (password + WebAuthn) completes. */
export default function ProductionBootstrapGate({ children }: Props) {
  const bootstrap = useAuthStore(s => s.bootstrap);
  const clearBootstrap = useAuthStore(s => s.clearBootstrap);

  useEffect(() => {
    if (bootstrap && !bootstrap.required) {
      clearBootstrap();
    }
  }, [bootstrap, clearBootstrap]);

  if (bootstrap?.required) {
    return (
      <>
        <div className="pointer-events-none opacity-40 select-none" aria-hidden>
          {children}
        </div>
        <ProductionBootstrapModal
          bootstrap={bootstrap}
          onComplete={clearBootstrap}
        />
      </>
    );
  }

  return <>{children}</>;
}
