import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

/**
 * Get executive sales dashboard metrics and reports
 */
router.get('/dashboard', (req, res) => {
  const db = req.db || getDb();

  // 1. Pipeline Summary
  const oppSummary = db.get(
    `SELECT 
       COALESCE(SUM(CASE WHEN ps.is_won = 0 AND ps.is_lost = 0 THEN o.amount ELSE 0 END), 0) as open_pipeline_value,
       COALESCE(SUM(CASE WHEN ps.is_won = 0 AND ps.is_lost = 0 THEN (o.amount * o.probability / 100.0) ELSE 0 END), 0) as weighted_forecast,
       COALESCE(SUM(CASE WHEN ps.is_won = 1 THEN o.amount ELSE 0 END), 0) as won_value,
       COUNT(CASE WHEN ps.is_won = 0 AND ps.is_lost = 0 THEN 1 END) as open_deals_count,
       COUNT(CASE WHEN ps.is_won = 1 THEN 1 END) as won_deals_count,
       COUNT(CASE WHEN ps.is_lost = 1 THEN 1 END) as lost_deals_count
     FROM opportunities o
     JOIN pipeline_stages ps ON ps.id = o.stage_id
     WHERE o.organization_id = ?`,
    [req.orgId]
  );

  const totalClosed = (oppSummary?.won_deals_count || 0) + (oppSummary?.lost_deals_count || 0);
  const winRate = totalClosed > 0 
    ? Math.round(((oppSummary?.won_deals_count || 0) / totalClosed) * 100) 
    : 0;

  // 2. Leads Summary
  const leadSummary = db.get(
    `SELECT 
       COUNT(*) as total_leads,
       COUNT(CASE WHEN is_converted = 0 THEN 1 END) as active_leads,
       COUNT(CASE WHEN is_converted = 1 THEN 1 END) as converted_leads
     FROM leads
     WHERE organization_id = ?`,
    [req.orgId]
  );

  const totalLeads = leadSummary?.total_leads || 0;
  const leadConversionRate = totalLeads > 0
    ? Math.round(((leadSummary?.converted_leads || 0) / totalLeads) * 100)
    : 0;

  // 3. Stage Breakdown
  const stagesBreakdown = db.all(
    `SELECT 
       ps.id,
       ps.name as stage_name,
       ps.stage_order,
       ps.probability,
       ps.is_won,
       ps.is_lost,
       COUNT(o.id) as deal_count,
       COALESCE(SUM(o.amount), 0) as total_amount
     FROM pipeline_stages ps
     LEFT JOIN opportunities o ON o.stage_id = ps.id AND o.organization_id = ps.organization_id
     WHERE ps.organization_id = ?
     GROUP BY ps.id
     ORDER BY ps.stage_order ASC`,
    [req.orgId]
  );

  // 4. Leads by Source
  const leadsBySource = db.all(
    `SELECT 
       source,
       COUNT(*) as count
     FROM leads
     WHERE organization_id = ?
     GROUP BY source
     ORDER BY count DESC`,
    [req.orgId]
  );

  // 5. Recent Activity Feed
  const recentActivities = db.all(
    `SELECT 
       act.*,
       u.first_name as author_first,
       u.last_name as author_last
     FROM activities act
     LEFT JOIN users u ON u.id = act.created_by
     WHERE act.organization_id = ?
     ORDER BY act.created_at DESC
     LIMIT 10`,
    [req.orgId]
  );

  // 6. Organization currency
  const org = db.get('SELECT currency_symbol, currency_code FROM organizations WHERE id = ?', [req.orgId]);

  res.json({
    kpis: {
      open_pipeline_value: oppSummary?.open_pipeline_value || 0,
      weighted_forecast: Math.round(oppSummary?.weighted_forecast || 0),
      won_value: oppSummary?.won_value || 0,
      open_deals_count: oppSummary?.open_deals_count || 0,
      won_deals_count: oppSummary?.won_deals_count || 0,
      lost_deals_count: oppSummary?.lost_deals_count || 0,
      win_rate: winRate,
      active_leads_count: leadSummary?.active_leads || 0,
      converted_leads_count: leadSummary?.converted_leads || 0,
      lead_conversion_rate: leadConversionRate
    },
    stages_breakdown: stagesBreakdown,
    leads_by_source: leadsBySource,
    recent_activities: recentActivities,
    currency: org || { currency_symbol: '$', currency_code: 'USD' }
  });
});

export default router;
