import sdk from './meta-insights-fields.json';

export type MetaMetric = {
  id: string;
  label: string;
  group: string;
  field: string;
  actionType?: string;
  format: 'number' | 'currency' | 'percent';
  additive: boolean;
  scale: number;
};

// SDK strings include both numeric values and textual metadata. Keep every scalar
// candidate except these dimensions, identities, dates, labels and rankings.
// Candidate presence is not a promise of availability for an account/API level.
const TEXT_FIELDS = new Set([
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

// Arbitrary Object and AdsHistogramStats arrays are deliberately not measures.
const SCALAR_FIELDS = new Set(Object.entries(sdk.fields)
  .filter(([field, type]) => ['string', 'int', 'float', 'unsigned int'].includes(type) && !TEXT_FIELDS.has(field))
  .map(([field]) => field));

// Only known additive totals are marked safe. Specialized/unknown semantics stay
// non-additive; even action totals must never be summed across different subtypes.
const ADDITIVE_FIELDS = new Set([
  'spend', 'social_spend', 'marketing_messages_spend', 'impressions', 'clicks',
  'full_view_impressions', 'inline_link_clicks', 'inline_post_engagement',
  'instagram_profile_follow', 'instagram_profile_visits',
  'instagram_upcoming_event_reminders_set', 'instant_experience_clicks_to_open',
  'instant_experience_clicks_to_start', 'product_views', 'shop_clicks',
  'shops_assisted_purchases', 'total_card_view', 'total_postbacks',
  'messages_delivered', 'marketing_messages_delivered', 'marketing_messages_sent',
  'marketing_messages_read', 'marketing_messages_link_btn_click',
  'marketing_messages_quick_reply_btn_click',
]);
const LABELS: Record<string, string> = {
  spend: 'Investimento', impressions: 'Impressões', clicks: 'Cliques', reach: 'Alcance',
  frequency: 'Frequência', ctr: 'CTR', cpc: 'CPC', cpm: 'CPM', cpp: 'Custo por mil pessoas alcançadas',
  inline_link_clicks: 'Cliques no link', inline_link_click_ctr: 'CTR do link',
  unique_clicks: 'Cliques únicos', unique_ctr: 'CTR único', unique_inline_link_clicks: 'Cliques únicos no link',
  inline_post_engagement: 'Engajamento com a publicação', social_spend: 'Investimento social',
  cost_per_inline_link_click: 'Custo por clique no link', cost_per_inline_post_engagement: 'Custo por engajamento',
  cost_per_unique_click: 'Custo por clique único', cost_per_unique_inline_link_click: 'Custo por clique único no link',
  instagram_profile_follow: 'Seguidores do Instagram', instagram_profile_visits: 'Visitas ao perfil do Instagram',
};

function scalarMetric(field: string): MetaMetric {
  // CTRs and these documented percentage-point measures normalize to fractions.
  // Unverified specialized *_rate / *_per_* ratios remain raw numbers, not
  // guessed percentages; SDK types alone do not specify their denominator/unit.
  const percent = /(^|_)ctr$/.test(field) || field === 'canvas_avg_view_percent' || /^estimated_ad_recall_rate(?:_|$)/.test(field);
  const currency = /(^|_)(cost|spend|bid|budget)(_|$)/.test(field) || ['cpc', 'cpm', 'cpp'].includes(field);
  const format = percent ? 'percent' : currency ? 'currency' : 'number';
  return {
    id: field, label: Object.hasOwn(LABELS, field) ? LABELS[field] : field,
    group: percent ? 'Taxas' : currency ? 'Custos e valores' : 'Métricas',
    field, format, additive: ADDITIVE_FIELDS.has(field), scale: percent ? 0.01 : 1,
  };
}

const ACTION_FIELDS = new Set(Object.entries(sdk.fields)
  .filter(([, type]) => type === 'list<AdsActionStats>').map(([field]) => field));
const PROTOTYPE_KEYS = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);
const COMMON_ACTIONS = [
  'link_click', 'landing_page_view', 'post_engagement', 'page_engagement',
  'post_reaction', 'comment', 'post', 'like', 'lead', 'purchase', 'omni_purchase',
  'offsite_conversion.fb_pixel_lead', 'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.fb_pixel_add_to_cart', 'offsite_conversion.fb_pixel_initiate_checkout',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection', 'video_view',
];
const PURCHASE_ACTIONS = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
const ACTION_LABELS: Record<string, string> = {
  actions: 'Ações', action_values: 'Valor das ações', conversions: 'Conversões',
  conversion_values: 'Valor das conversões', cost_per_action_type: 'Custo por ação',
  unique_actions: 'Ações únicas', cost_per_unique_action_type: 'Custo por ação única',
  purchase_roas: 'ROAS de compras', website_purchase_roas: 'ROAS de compras no site',
  outbound_clicks: 'Cliques de saída', outbound_clicks_ctr: 'CTR de saída', unique_outbound_clicks: 'Cliques únicos de saída',
  unique_outbound_clicks_ctr: 'CTR único de saída', cost_per_outbound_click: 'Custo por clique de saída',
  cost_per_unique_outbound_click: 'Custo por clique único de saída', website_ctr: 'CTR do site',
  video_play_actions: 'Reproduções de vídeo', video_p25_watched_actions: 'Vídeo 25%', video_p50_watched_actions: 'Vídeo 50%',
  video_p75_watched_actions: 'Vídeo 75%', video_p95_watched_actions: 'Vídeo 95%', video_p100_watched_actions: 'Vídeo 100%',
  video_thruplay_watched_actions: 'ThruPlays', video_avg_time_watched_actions: 'Tempo médio de vídeo (s)',
};

const ACTION_TYPE_LABELS: Record<string, string> = { lead: 'Leads', purchase: 'Compras', omni_purchase: 'Compras omnicanal', link_click: 'Cliques no link', landing_page_view: 'Visualizações da página de destino', post_engagement: 'Engajamento com publicação', page_engagement: 'Engajamento com página', comment: 'Comentários', like: 'Curtidas', post: 'Compartilhamentos', post_reaction: 'Reações', video_view: 'Visualizações de vídeo', 'onsite_conversion.messaging_conversation_started_7d': 'Conversas iniciadas em 7 dias', 'onsite_conversion.total_messaging_connection': 'Conexões por mensagem' };
function actionMetric(field: string, actionType: string): MetaMetric {
  const percent = /(^|_)ctr$/.test(field);
  const roas = field.includes('roas');
  const currency = !roas && (field.includes('cost_per_') || /(?:^|_)values?$/.test(field) || field.endsWith('actionvalue'));
  const nonadditive = /unique|reach|frequency|cost_per_|roas|average|avg|rate|ctr|per_impression/.test(field);
  const knownTotal = ['actions', 'action_values', 'conversions', 'conversion_values', 'outbound_clicks'].includes(field) || field.startsWith('video_');
  const family = Object.hasOwn(ACTION_LABELS, field) ? ACTION_LABELS[field] : field;
  return {
    id: `${field}:${actionType}`, label: `${family} · ${Object.hasOwn(ACTION_TYPE_LABELS, actionType) ? `${ACTION_TYPE_LABELS[actionType]} (${actionType})` : actionType}`,
    group: /video|thruplay/.test(field) ? 'Vídeo' : roas ? 'ROAS' : currency ? 'Custos e valores' : percent ? 'Taxas' : 'Ações e conversões',
    field, actionType, format: percent ? 'percent' : currency ? 'currency' : 'number',
    additive: knownTotal && !nonadditive, scale: percent ? 0.01 : 1,
  };
}

function seededActions(): MetaMetric[] {
  const metrics: MetaMetric[] = [];
  for (const field of ['outbound_clicks', 'outbound_clicks_ctr', 'unique_outbound_clicks', 'unique_outbound_clicks_ctr', 'cost_per_outbound_click', 'cost_per_unique_outbound_click']) metrics.push(actionMetric(field, 'outbound_click'));
  metrics.push(actionMetric('website_ctr', 'link_click'));
  for (const field of ['actions', 'cost_per_action_type', 'unique_actions', 'cost_per_unique_action_type']) {
    metrics.push(...COMMON_ACTIONS.map(action => actionMetric(field, action)));
  }
  for (const field of ['action_values', 'conversions', 'conversion_values']) {
    metrics.push(...['lead', ...PURCHASE_ACTIONS].map(action => actionMetric(field, action)));
  }
  for (const field of ['purchase_roas', 'website_purchase_roas', 'mobile_app_purchase_roas']) {
    metrics.push(...PURCHASE_ACTIONS.map(action => actionMetric(field, action)));
  }
  for (const field of ACTION_FIELDS) {
    if (/video|thruplay/.test(field)) metrics.push(actionMetric(field, 'video_view'));
  }
  return metrics;
}

export const BASE_META_METRICS: MetaMetric[] = [
  ...[...SCALAR_FIELDS].map(scalarMetric), ...seededActions(),
].sort((a, b) => a.id.localeCompare(b.id));

export const META_DISCOVERY_FIELDS: string[] = [
  'actions', 'action_values', 'conversions', 'conversion_values',
  'cost_per_action_type', 'unique_actions', 'cost_per_unique_action_type',
  'purchase_roas', 'website_purchase_roas',
];

export function discoverMetaMetrics(rows: Array<Record<string, unknown>>): MetaMetric[] {
  const metrics = new Map(BASE_META_METRICS.map(metric => [metric.id, { ...metric }]));
  let actionCount = BASE_META_METRICS.filter(metric => metric.actionType !== undefined).length;
  // Include seeds in this quota. Scalar candidates are never dropped to make room
  // for arbitrary custom conversions. A missing value does not mean zero: this
  // function discovers definitions only; the connector owns nullable values.
  discovery: for (const row of rows) {
    for (const field of ACTION_FIELDS) {
      const values = row[field];
      if (!Array.isArray(values)) continue;
      for (const entry of values) {
        if (actionCount >= 1500) break discovery;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
            !Object.hasOwn(entry, 'action_type') || typeof entry.action_type !== 'string') continue;
        const metric = getMetaMetric(`${field}:${entry.action_type}`);
        if (metric && !metrics.has(metric.id)) {
          metrics.set(metric.id, metric);
          actionCount++;
        }
      }
    }
  }
  return [...metrics.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function getMetaMetric(id: string): MetaMetric | undefined {
  if (typeof id !== 'string') return undefined;
  if (SCALAR_FIELDS.has(id)) return scalarMetric(id);
  const parts = id.split(':');
  if (parts.length !== 2) return undefined;
  const [field, actionType] = parts;
  if (!ACTION_FIELDS.has(field) || actionType.length < 1 || actionType.length > 180 ||
      !/^[A-Za-z0-9_.-]+$/.test(actionType) || /[^A-Za-z0-9_.-]/.test(actionType) ||
      actionType.split('.').some(part => PROTOTYPE_KEYS.has(part))) return undefined;
  return actionMetric(field, actionType);
}
