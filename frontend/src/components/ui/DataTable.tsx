import { useMemo, useState, type ReactNode, type CSSProperties } from 'react';
import { Search, Filter, X, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Column<T> {
  key: string;
  header: ReactNode;
  width?: number | string;
  align?: 'left' | 'right' | 'center';
  render?: (row: T) => ReactNode;
  className?: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  options: { value: string; label?: string }[];
}

export type FilterState = Record<string, string[]>;

interface DataTableProps<T> {
  title?: string;
  subtitle?: string;
  data: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Total before client-side filter, for "X of Y" header */
  totalCount?: number;

  /** Search bar */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;

  /** Filter sidebar */
  filterGroups?: FilterGroup[];
  filterState?: FilterState;
  onFilterChange?: (state: FilterState) => void;

  /** Row interaction */
  onRowClick?: (row: T) => void;
  isRowActive?: (row: T) => boolean;

  /** Expandable row rendering */
  renderExpanded?: (row: T) => ReactNode;
  expandedKey?: string | null;
  onExpandChange?: (key: string | null) => void;

  emptyMessage?: string;
  /** Extra header buttons (e.g. "Add", "Clear") rendered to the right */
  headerActions?: ReactNode;
  /** Optional max height for the scrollable body */
  maxBodyHeight?: number | string;
  /** Animate row inserts when data changes */
  animateRows?: boolean;
}

export default function DataTable<T>({
  title,
  subtitle,
  data,
  columns,
  rowKey,
  totalCount,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filterGroups,
  filterState,
  onFilterChange,
  onRowClick,
  isRowActive,
  renderExpanded,
  expandedKey: controlledExpanded,
  onExpandChange,
  emptyMessage,
  headerActions,
  maxBodyHeight,
  animateRows = false,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [showSidebar, setShowSidebar] = useState(false);
  const [internalExpanded, setInternalExpanded] = useState<string | null>(null);

  const expandedKey = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const setExpanded = (key: string | null) => {
    if (onExpandChange) onExpandChange(key);
    else setInternalExpanded(key);
  };

  const activeFilterCount = useMemo(() => {
    if (!filterState) return 0;
    return Object.values(filterState).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
  }, [filterState]);

  const hasSearch = onSearchChange !== undefined;
  const hasFilters = !!(filterGroups && filterGroups.length > 0 && onFilterChange);

  const toggleFilter = (groupKey: string, value: string) => {
    if (!onFilterChange || !filterState) return;
    const current = filterState[groupKey] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFilterChange({ ...filterState, [groupKey]: next });
  };

  const clearFilters = () => {
    if (!onFilterChange || !filterGroups) return;
    const empty: FilterState = {};
    for (const g of filterGroups) empty[g.key] = [];
    onFilterChange(empty);
  };

  const showHeader = title || hasSearch || hasFilters || headerActions;

  return (
    <div className="dt-panel">
      {showHeader && (
        <div className="dt-panel__header">
          {title && (
            <div>
              <h3 className="dt-panel__title">
                {title}
                {totalCount !== undefined && (
                  <span className="dt-panel__count">
                    {totalCount === data.length
                      ? `· ${data.length}`
                      : `· ${data.length}/${totalCount}`}
                  </span>
                )}
              </h3>
              {subtitle && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', marginTop: 2 }}>
                  {subtitle}
                </p>
              )}
            </div>
          )}

          <div className="dt-panel__spacer" />

          {hasSearch && (
            <div className="dt-search">
              <Search className="dt-search__icon" size={14} />
              <input
                type="text"
                className="dt-search__input"
                value={searchValue ?? ''}
                onChange={(e) => onSearchChange!(e.target.value)}
                placeholder={searchPlaceholder ?? t('common.search')}
              />
            </div>
          )}

          {hasFilters && (
            <button
              type="button"
              onClick={() => setShowSidebar((v) => !v)}
              className={`dt-filter-btn ${showSidebar ? 'dt-filter-btn--active' : ''}`}
              aria-pressed={showSidebar}
            >
              <Filter size={14} />
              <span>{t('table.filters')}</span>
              {activeFilterCount > 0 && (
                <span className="dt-filter-btn__count">{activeFilterCount}</span>
              )}
            </button>
          )}

          {headerActions}
        </div>
      )}

      <div className="dt-body">
        {hasFilters && (
          <aside className={`dt-sidebar ${showSidebar ? 'dt-sidebar--open' : ''}`}>
            <div className="dt-sidebar__inner">
              <div className="dt-sidebar__head">
                <span className="dt-sidebar__title">{t('table.filters')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {activeFilterCount > 0 && (
                    <button type="button" className="dt-sidebar__clear" onClick={clearFilters}>
                      {t('common.clear')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSidebar(false)}
                    className="dt-sidebar__clear"
                    style={{ display: 'inline-flex', alignItems: 'center' }}
                    aria-label={t('common.cancel')}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {filterGroups!.map((group) => {
                const selected = filterState?.[group.key] ?? [];
                return (
                  <div key={group.key} className="dt-sidebar__group">
                    <span className="dt-sidebar__group-label">{group.label}</span>
                    {group.options.map((opt) => {
                      const isOn = selected.includes(opt.value);
                      return (
                        <button
                          type="button"
                          key={opt.value}
                          onClick={() => toggleFilter(group.key, opt.value)}
                          aria-pressed={isOn}
                          className={`dt-chip ${isOn ? 'dt-chip--active' : ''}`}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opt.label ?? opt.value}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        <div
          className="dt-content"
          style={maxBodyHeight !== undefined ? { maxHeight: maxBodyHeight } : undefined}
        >
          <table className="table">
            <thead>
              <tr>
                {renderExpanded && <th style={{ width: 32 }} />}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    style={{
                      width: col.width,
                      textAlign: col.align ?? 'left',
                    }}
                    className={col.className}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (renderExpanded ? 1 : 0)}
                    className="dt-empty"
                  >
                    {emptyMessage ?? t('common.noData')}
                  </td>
                </tr>
              ) : (
                data.map((row) => {
                  const key = rowKey(row);
                  const isExpanded = expandedKey === key;
                  const isActive = isRowActive ? isRowActive(row) : false;
                  const clickable = !!onRowClick || !!renderExpanded;
                  const handleClick = () => {
                    if (renderExpanded) setExpanded(isExpanded ? null : key);
                    if (onRowClick) onRowClick(row);
                  };
                  const rowClass = [
                    clickable ? 'is-clickable' : '',
                    isActive || isExpanded ? 'is-active' : '',
                    animateRows ? 'is-animated' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <ExpandableRow
                      key={key}
                      rowClass={rowClass}
                      onClick={clickable ? handleClick : undefined}
                      hasExpand={!!renderExpanded}
                      isExpanded={isExpanded}
                      columns={columns}
                      row={row}
                      renderExpanded={renderExpanded}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ExpandableRow<T>(props: {
  rowClass: string;
  onClick?: () => void;
  hasExpand: boolean;
  isExpanded: boolean;
  columns: Column<T>[];
  row: T;
  renderExpanded?: (row: T) => ReactNode;
}) {
  const { rowClass, onClick, hasExpand, isExpanded, columns, row, renderExpanded } = props;
  return (
    <>
      <tr className={rowClass} onClick={onClick}>
        {hasExpand && (
          <td style={{ paddingRight: 0 }}>
            <span style={{ color: 'var(--clr-text-muted)', display: 'inline-flex' }}>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </td>
        )}
        {columns.map((col) => {
          const cellStyle: CSSProperties = { textAlign: col.align ?? 'left' };
          return (
            <td key={col.key} style={cellStyle} className={col.className}>
              {col.render ? col.render(row) : (row as unknown as Record<string, unknown>)[col.key] as ReactNode}
            </td>
          );
        })}
      </tr>
      {hasExpand && isExpanded && renderExpanded && (
        <tr className="row-detail">
          <td colSpan={columns.length + 1}>{renderExpanded(row)}</td>
        </tr>
      )}
    </>
  );
}
