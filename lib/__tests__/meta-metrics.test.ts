// @vitest-environment node
import { describe, expect, it } from 'vitest';
import sdk from '../meta-insights-fields.json';
import { BASE_META_METRICS, getMetaMetric, META_DISCOVERY_FIELDS, discoverMetaMetrics } from '../meta-metrics';

// The SDK calls both numerical values and dimensions strings. These are dimensions,
// dates, qualitative labels/rankings or attribution/performance metadata, not measures.
const textualFields = new Set([
  'account_currency', 'account_id', 'account_name', 'ad_id', 'ad_name',
  'adset_end', 'adset_id', 'adset_name', 'adset_start', 'age_targeting',
  'anchor_event_attribution_setting', 'anchor_events_performance_indicator',
  'attribution_setting', 'buying_type', 'campaign_id', 'campaign_name',
  'conversion_rate_ranking', 'created_time', 'creative_diversity_label',
  'creative_media_type', 'date_start', 'date_stop', 'engagement_rate_ranking',
  'gender_targeting', 'labels', 'location', 'marketing_messages_spend_currency',
  'multi_event_conversion_attribution_setting', 'objective', 'optimization_goal',
  'place_page_name', 'product_group_retailer_id', 'product_retailer_id',
  'quality_ranking', 'result_values_performance_indicator', 'updated_time',
]);

describe('Meta metric registry', () => {
  it('offers outbound-click arrays and searchable Portuguese names for common events', () => {
    for (const field of ['outbound_clicks', 'outbound_clicks_ctr', 'unique_outbound_clicks', 'unique_outbound_clicks_ctr', 'cost_per_outbound_click', 'cost_per_unique_outbound_click']) {
      expect(BASE_META_METRICS.some(metric => metric.id === `${field}:outbound_click`)).toBe(true);
    }
    expect(BASE_META_METRICS.some(metric => metric.id === 'website_ctr:link_click')).toBe(true);
    expect(getMetaMetric('actions:lead')?.label).toContain('Leads');
    expect(getMetaMetric('actions:landing_page_view')?.label).toContain('página de destino');
  });
  it('declares only the contracted lightweight initial discovery families', () => {
    expect(META_DISCOVERY_FIELDS).toEqual(['actions', 'action_values', 'conversions', 'conversion_values', 'cost_per_action_type', 'unique_actions', 'cost_per_unique_action_type', 'purchase_roas', 'website_purchase_roas']);
  });
  it('discovers all returned SDK action families and merges sorted unique IDs without collapsing subtypes', () => {
    expect(typeof discoverMetaMetrics).toBe('function');
    const row = Object.fromEntries(Object.entries(sdk.fields).filter(([, type]) => type === 'list<AdsActionStats>').map(([field]) => [field, [
      { action_type: 'offsite_conversion.custom.987', value: '4' },
      { action_type: 'offsite_conversion.custom.654', value: '5' },
    ]]));
    const result = discoverMetaMetrics([row, row]);
    const ids = result.map(metric => metric.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
    expect(result).toEqual(expect.arrayContaining(BASE_META_METRICS));
    for (const field of Object.keys(row)) {
      expect(ids).toContain(`${field}:offsite_conversion.custom.987`);
      expect(ids).toContain(`${field}:offsite_conversion.custom.654`);
    }
    expect(discoverMetaMetrics([row])).toEqual(discoverMetaMetrics([row, row]));
  });
  it('does not invent zero-valued metrics from absent data or trust malformed/unapproved families', () => {
    expect(typeof discoverMetaMetrics).toBe('function');
    const row = {
      actions: [null, {}, [], { action_type: 42 }, { action_type: '__proto__', value: '1' },
        { action_type: 'bad,field', value: '1' }, { action_type: 'missing_value' },
        { action_type: 'null_value', value: null }, { action_type: 'zero_value', value: '0' }],
      conversions: null, action_values: {}, unknown_actions: [{ action_type: 'x' }],
      video_play_curve_actions: [{ action_type: 'x', value: '1' }],
      results: [{ action_type: 'x', value: '1' }],
    };
    const before = JSON.stringify(row);
    const result = discoverMetaMetrics([row]);
    expect(result.filter(metric => !BASE_META_METRICS.some(base => base.id === metric.id)).map(metric => metric.id)).toEqual([
      'actions:missing_value', 'actions:null_value', 'actions:zero_value',
    ]);
    expect(result.every(metric => !Object.hasOwn(metric, 'value'))).toBe(true);
    expect(JSON.stringify(row)).toBe(before);
    expect(discoverMetaMetrics([{}, { actions: [] }])).toEqual(BASE_META_METRICS);
  });
  it('bounds the entire action catalogue at 1500, preserving scalar and seed entries', () => {
    expect(typeof discoverMetaMetrics).toBe('function');
    const result = discoverMetaMetrics([{ actions: Array.from({ length: 2000 }, (_, i) => ({ action_type: `custom.${i}`, value: '1' })) }]);
    expect(result.filter(metric => metric.actionType)).toHaveLength(1500);
    expect(result.filter(metric => !metric.actionType)).toEqual(BASE_META_METRICS.filter(metric => !metric.actionType));
    expect(result).toEqual(expect.arrayContaining(BASE_META_METRICS));
    expect(getMetaMetric('actions:custom.1999')).toBeDefined();
  });
  it('uses PT-BR labels for common dashboard metrics and exact IDs for specialized fields', () => {
    for (const [id, label] of Object.entries({ spend: 'Investimento', impressions: 'Impressões', clicks: 'Cliques', reach: 'Alcance', frequency: 'Frequência', ctr: 'CTR', cpc: 'CPC', cpm: 'CPM', inline_link_clicks: 'Cliques no link' })) {
      expect(getMetaMetric(id)?.label).toBe(label);
    }
    expect(getMetaMetric('creative_diversity_score')?.label).toBe('creative_diversity_score');
  });
  it('resolves every SDK AdsActionStats family as a distinct subtype metric', () => {
    for (const [field, type] of Object.entries(sdk.fields)) {
      if (type !== 'list<AdsActionStats>') continue;
      const id = `${field}:offsite_conversion.custom.123-example`;
      expect(getMetaMetric(id)).toMatchObject({ id, field, actionType: 'offsite_conversion.custom.123-example' });
      expect(getMetaMetric(id)!.label).toContain('offsite_conversion.custom.123-example');
    }
    expect(getMetaMetric('actions:lead')).not.toEqual(getMetaMetric('conversions:lead'));
  });
  it.each([
    ['', undefined], ['actions:', undefined], ['actions:a:b', undefined],
    ['actions:lead{value}', undefined], ['actions:lead,spend', undefined],
    ['actions:lead/value', undefined], ['actions:lead value', undefined],
    ['actions:lead\n', undefined], ['actions:é', undefined],
    ['actions:__proto__', undefined], ['actions:constructor', undefined],
    ['actions:prototype', undefined], ['actions:x.__proto__.y', undefined],
    ['actions:toString', undefined], ['__proto__', undefined],
    ['account_id:lead', undefined], ['spend:lead', undefined],
    ['results:lead', undefined], ['video_play_curve_actions:video_view', undefined],
    ['unknown_actions:lead', undefined], ['actions:' + 'a'.repeat(181), undefined],
  ])('rejects unsafe or non-measure ID %j', id => {
    expect(getMetaMetric(id as string)).toBeUndefined();
  });
  it('accepts an exact 180-character action subtype without truncation', () => {
    const actionType = 'a'.repeat(180);
    expect(getMetaMetric(`actions:${actionType}`)).toMatchObject({ actionType });
  });
  it.each([
    ['actions:lead', 'number', true, 1],
    ['action_values:purchase', 'currency', true, 1],
    ['conversion_values:offsite_conversion.custom.1', 'currency', true, 1],
    ['cost_per_action_type:lead', 'currency', false, 1],
    ['cost_per_unique_action_type:lead', 'currency', false, 1],
    ['unique_actions:lead', 'number', false, 1],
    ['purchase_roas:omni_purchase', 'number', false, 1],
    ['catalog_segment_value_website_purchase_roas:purchase', 'number', false, 1],
    ['video_avg_time_watched_actions:video_view', 'number', false, 1],
    ['video_p100_watched_actions:video_view', 'number', true, 1],
    ['unique_video_view_15_sec:video_view', 'number', false, 1],
    ['outbound_clicks_ctr:outbound_click', 'percent', false, 0.01],
    ['average_purchases_conversion_value:purchase', 'currency', false, 1],
    ['configurable_audience_overlap_reach:lead', 'number', false, 1],
  ])('keeps subtype units and nonadditive metadata for %s', (id, format, additive, scale) => {
    expect(getMetaMetric(id as string)).toMatchObject({ format, additive, scale });
  });
  it('seeds common actions and every SDK video action family without a Cartesian catalogue', () => {
    const ids = new Set(BASE_META_METRICS.map(metric => metric.id));
    for (const id of ['actions:lead', 'actions:purchase', 'actions:link_click',
      'actions:landing_page_view', 'actions:post_engagement', 'actions:video_view',
      'action_values:purchase', 'cost_per_action_type:lead', 'purchase_roas:omni_purchase']) {
      expect(ids.has(id), id).toBe(true);
    }
    for (const [field, type] of Object.entries(sdk.fields)) {
      if (type === 'list<AdsActionStats>' && /video|thruplay/.test(field)) {
        expect(ids.has(`${field}:video_view`), field).toBe(true);
      }
    }
    expect(ids.has('configurable_audience_overlap_reach:purchase')).toBe(false);
    expect(ids.size).toBe(BASE_META_METRICS.length);
  });
  it.each([
    ['spend', 'currency', true, 1], ['social_spend', 'currency', true, 1],
    ['impressions', 'number', true, 1], ['clicks', 'number', true, 1],
    ['reach', 'number', false, 1], ['unique_clicks', 'number', false, 1],
    ['advanced_reach_7d_lookback', 'number', false, 1],
    ['frequency', 'number', false, 1], ['canvas_avg_view_time', 'number', false, 1],
    ['cpc', 'currency', false, 1], ['cpm', 'currency', false, 1],
    ['cost_per_inline_link_click', 'currency', false, 1],
    ['marketing_messages_cost_per_delivered', 'currency', false, 1],
    ['ctr', 'percent', false, 0.01], ['inline_link_click_ctr', 'percent', false, 0.01],
    ['unique_ctr', 'percent', false, 0.01], ['canvas_avg_view_percent', 'percent', false, 0.01],
    ['estimated_ad_recall_rate', 'percent', false, 0.01],
    ['creative_diversity_score', 'number', false, 1],
  ])('declares correct display scale and aggregation safety for %s', (id, format, additive, scale) => {
    expect(getMetaMetric(id as string)).toMatchObject({ format, additive, scale });
  });
  it('normalizes percentage points to fractions, not a second percentage multiplication', () => {
    expect(2.5 * getMetaMetric('ctr')!.scale).toBe(0.025);
    for (const metric of BASE_META_METRICS) {
      expect(metric.label.length).toBeGreaterThan(0);
      expect(metric.group.length).toBeGreaterThan(0);
      expect(metric.scale).toBe(metric.format === 'percent' ? 0.01 : 1);
    }
  });
  it('covers every safe SDK scalar candidate without allowing dimensions or structured values', async () => {
    const registry = await import('../meta-metrics').catch(() => undefined);
    expect(registry, 'the shared registry must exist').toBeDefined();
    if (!registry) return;
    const expected = Object.entries(sdk.fields)
      .filter(([field, type]) => ['string', 'int', 'float', 'unsigned int'].includes(type) && !textualFields.has(field))
      .map(([field]) => field).sort();
    expect(registry.BASE_META_METRICS.filter(metric => !metric.actionType).map(metric => metric.id).sort()).toEqual(expected);
    for (const field of expected) {
      expect(registry.getMetaMetric(field)).toMatchObject({ id: field, field });
    }
    for (const [field, type] of Object.entries(sdk.fields)) {
      if (textualFields.has(field) || type.startsWith('list<')) expect(registry.getMetaMetric(field)).toBeUndefined();
    }
    expect(registry.getMetaMetric('unknown_numeric_metric')).toBeUndefined();
    expect(new Set(registry.BASE_META_METRICS.map(metric => metric.id)).size).toBe(registry.BASE_META_METRICS.length);
  });
});
