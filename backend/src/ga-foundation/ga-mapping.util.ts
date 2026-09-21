import { BadRequestException } from '@nestjs/common';
import type { MappingCatalogItemInput, NormalizedRect, TerminalBlockInput } from './ga-foundation.types';

const DEFAULT_DEVICE_SEPARATORS = /[\s_-]+/g;

function configuredTerminalPrefixes(): string[] {
  return String(process.env.DWES_GA_TERMINAL_PREFIXES || 'X,T')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * Normalizes a device tag using only the explicitly supported separators.
 * Engineering characters such as `/`, `+`, `.`, and `:` remain meaningful.
 */
export function normalizeDeviceTag(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(DEFAULT_DEVICE_SEPARATORS, '');
}

export function normalizeTerminal(value: string): string {
  let normalized = String(value ?? '').normalize('NFKC').trim().toUpperCase().replace(/\s+/g, '');
  for (const prefix of configuredTerminalPrefixes()) {
    const match = normalized.match(new RegExp(`^${escapeRegex(prefix)}[-_:]?(\\d+)$`));
    if (match) {
      normalized = match[1];
      break;
    }
  }
  return normalized;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseCombinedEndpoint(value: string): { device: string; terminal: string } {
  const raw = String(value ?? '').normalize('NFKC').trim();
  if (!raw) return { device: '', terminal: '' };

  const colon = raw.lastIndexOf(':');
  if (colon > 0 && colon < raw.length - 1) {
    return { device: raw.slice(0, colon), terminal: raw.slice(colon + 1) };
  }

  const separatedTerminal = raw.match(/^(.*?)(?:\s+|[-_])(\d+[A-Z]?)$/i);
  if (separatedTerminal?.[1] && separatedTerminal[2]) {
    return { device: separatedTerminal[1], terminal: separatedTerminal[2] };
  }

  return { device: raw, terminal: '' };
}

export function normalizeEndpointReference(device: string, terminal: string): string {
  const normalizedDevice = normalizeDeviceTag(device);
  const normalizedTerminal = normalizeTerminal(terminal);
  return normalizedDevice && normalizedTerminal ? `${normalizedDevice}:${normalizedTerminal}` : '';
}

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

export function assertNormalizedRect(rect: NormalizedRect): void {
  if (!rect || !isUnitInterval(rect.x) || !isUnitInterval(rect.y)
      || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
      || rect.width <= 0 || rect.height <= 0
      || rect.x + rect.width > 1.000001 || rect.y + rect.height > 1.000001) {
    throw new BadRequestException('Mapping rectangle must be positive and remain inside the normalized face bounds');
  }
}

function terminalLabel(first: string, index: number): string {
  const trimmed = String(first ?? '').trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return index === 0 ? trimmed : `${trimmed}${index}`;
  const width = match[2].length;
  const next = String(Number(match[2]) + index).padStart(width, '0');
  return `${match[1]}${next}`;
}

export interface CalculatedTerminalPoint {
  terminalNumber: string;
  terminalIndex: number;
  normalizedX: number;
  normalizedY: number;
}

export function calculateTerminalPoints(
  rect: NormalizedRect,
  block: TerminalBlockInput,
): CalculatedTerminalPoint[] {
  assertNormalizedRect(rect);
  if (!Number.isInteger(block.count) || block.count < 1 || block.count > 10_000) {
    throw new BadRequestException('Terminal count must be an integer between 1 and 10000');
  }
  if (!String(block.firstTerminalNumber ?? '').trim()) {
    throw new BadRequestException('First terminal number is required');
  }
  if (!Number.isFinite(block.pitch) || block.pitch <= 0 || block.pitch > 1) {
    throw new BadRequestException('Terminal pitch must be a positive normalized value no greater than 1');
  }
  if (block.orientation !== 'horizontal' && block.orientation !== 'vertical') {
    throw new BadRequestException('Terminal orientation must be horizontal or vertical');
  }

  const available = block.orientation === 'horizontal' ? rect.width : rect.height;
  if ((block.count - 1) * block.pitch > available + 0.000001) {
    throw new BadRequestException('Calculated terminal points exceed the mapped terminal-block rectangle');
  }

  return Array.from({ length: block.count }, (_, logicalIndex) => {
    const positionIndex = block.reversed ? block.count - 1 - logicalIndex : logicalIndex;
    const normalizedX = block.orientation === 'horizontal'
      ? rect.x + positionIndex * block.pitch
      : rect.x + rect.width / 2;
    const normalizedY = block.orientation === 'vertical'
      ? rect.y + positionIndex * block.pitch
      : rect.y + rect.height / 2;
    return {
      terminalNumber: terminalLabel(block.firstTerminalNumber, logicalIndex),
      terminalIndex: logicalIndex,
      normalizedX,
      normalizedY,
    };
  });
}

export function validateCatalogItems(items: MappingCatalogItemInput[]): void {
  if (!Array.isArray(items) || items.length === 0 || items.length > 5_000) {
    throw new BadRequestException('Mapping Catalog must contain between 1 and 5000 items');
  }
  const tags = new Set<string>();
  const stableIds = new Set<string>();
  for (const item of items) {
    const tag = String(item.tag ?? '').trim();
    const normalized = normalizeDeviceTag(tag);
    if (!tag || !normalized) throw new BadRequestException('Every Mapping Catalog item requires a tag');
    if (tags.has(normalized)) throw new BadRequestException(`Duplicate or ambiguous mapped tag: ${tag}`);
    tags.add(normalized);
    if (!['front', 'internal', 'rear', 'custom'].includes(item.face)) {
      throw new BadRequestException(`Unsupported GA face for ${tag}`);
    }
    assertNormalizedRect(item.rect);
    if (item.stableItemId) {
      if (stableIds.has(item.stableItemId)) throw new BadRequestException('Mapping Catalog stable item IDs must be unique');
      stableIds.add(item.stableItemId);
    }
    if (item.terminalBlock) calculateTerminalPoints(item.rect, item.terminalBlock);
    const aliases = (item.aliases ?? []).map(normalizeDeviceTag).filter(Boolean);
    if (new Set(aliases).size !== aliases.length) throw new BadRequestException(`Duplicate aliases for ${tag}`);
  }
}
