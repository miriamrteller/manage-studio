-- =============================================================================
-- Admin dashboard overview RPC (Phase 1F)
-- DEPENDENCIES: 000200 (tenants), 000500 (offerings), 001300 (engagements),
--               20260625000200 (get_finance_summary)
-- PA conditions applied: ALL 7 — see be-plan.md
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: get_tenant_today()
-- 3-branch UTC-fallback:
--   (1) tenants.timezone column does not exist → CURRENT_DATE (UTC server time)
--   (2) column exists but is NULL for this tenant   → CURRENT_DATE (UTC)
--   (3) column exists and is set                    → tenant-local date
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tenants'
          AND column_name = 'timezone'
    ) THEN
        -- Branch (1): no timezone column — always use UTC server date
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION public.get_tenant_today(p_tenant_id UUID)
            RETURNS DATE
            LANGUAGE plpgsql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS $inner$
            BEGIN
                RETURN CURRENT_DATE;
            END;
            $inner$
        $func$;
    ELSE
        -- Branch (2/3): timezone column exists — use tenant setting if present
        EXECUTE $func$
            CREATE OR REPLACE FUNCTION public.get_tenant_today(p_tenant_id UUID)
            RETURNS DATE
            LANGUAGE plpgsql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS $inner$
            DECLARE
                v_timezone TEXT;
            BEGIN
                SELECT timezone INTO v_timezone
                FROM public.tenants
                WHERE id = p_tenant_id;

                IF v_timezone IS NULL THEN
                    RETURN CURRENT_DATE;  -- Branch (2)
                END IF;

                RETURN (NOW() AT TIME ZONE v_timezone)::DATE;  -- Branch (3)
            END;
            $inner$
        $func$;
    END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_today(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- [PA Condition 7] Composite index for the admin overview daily-classes query.
-- Covers: season_id filter (high selectivity), day_of_week, status.
-- Required: EXPLAIN ANALYZE on 50+ offering tenant must show Index Scan / Bitmap
-- Index Scan (not Seq Scan) as a hard pre-merge gate.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_offerings_season_dow_status
    ON public.offerings(season_id, day_of_week, status);

-- ---------------------------------------------------------------------------
-- Main RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_overview()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_tenant_id         UUID;
    v_season_id         UUID;
    v_season_name       TEXT;
    v_today_dow         INTEGER;
    v_today_date        DATE;
    v_month_start       DATE;
    v_today_classes     JSONB;
    v_term_enrolments   INTEGER;
    v_admin_review      INTEGER;
    v_pending_payment   INTEGER;
    v_finance_summary   JSONB;
BEGIN
    -- Auth validation (same pattern as get_finance_summary)
    v_tenant_id := auth.uid();
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = 'PGRST401';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM user_profiles
        WHERE id = v_tenant_id
          AND ('tenant_admin' = ANY(role) OR 'super_admin' = ANY(role))
    ) THEN
        RAISE EXCEPTION 'Forbidden' USING ERRCODE = 'PGRST403';
    END IF;

    -- Get active season
    SELECT id, name
    INTO v_season_id, v_season_name
    FROM seasons
    WHERE tenant_id = v_tenant_id
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    -- [PA Condition 6] No active season → RAISE EXCEPTION P0001 (not silent NULL).
    -- Client must catch SQLSTATE P0001 and render "No active season" UI state.
    -- Navigation hint: go to /admin/setup/terms to create an active season.
    IF v_season_id IS NULL THEN
        RAISE EXCEPTION 'No active season found for this tenant'
            USING ERRCODE = 'P0001',
                  HINT = 'Create an active season under Settings > Seasons before using the admin dashboard overview.';
    END IF;

    -- [PA Condition 4] day_of_week alignment: offerings.day_of_week CHECK 0..6 matches
    -- EXTRACT(DOW) 0=Sun..6=Sat. No translation layer needed. VERIFIED.
    v_today_date  := public.get_tenant_today(v_tenant_id);
    v_today_dow   := EXTRACT(DOW FROM v_today_date)::INTEGER;
    v_month_start := DATE_TRUNC('month', v_today_date)::DATE;

    -- Today's classes with enrolled + waitlist counts
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id',             o.id,
                'name',           o.name,
                'start_time',     o.start_time::TEXT,
                'end_time',       o.end_time::TEXT,
                'location',       o.location,
                'max_capacity',   o.max_capacity,
                'enrolled_count', COALESCE(enrolled.cnt, 0),
                'waitlist_count', COALESCE(waitlisted.cnt, 0),
                'staff_name',     s.name
            )
            ORDER BY o.start_time
        ),
        '[]'::JSONB
    ) INTO v_today_classes
    FROM offerings o
    LEFT JOIN staff s ON o.staff_id = s.id
    LEFT JOIN (
        SELECT offering_id, COUNT(*) AS cnt
        FROM engagements
        WHERE tenant_id = v_tenant_id
          AND status IN ('active', 'pending_payment', 'pending_waiver', 'admin_review', 'pending_offer')
        GROUP BY offering_id
    ) enrolled ON o.id = enrolled.offering_id
    LEFT JOIN (
        SELECT offering_id, COUNT(*) AS cnt
        FROM waitlist
        WHERE tenant_id = v_tenant_id
        GROUP BY offering_id
    ) waitlisted ON o.id = waitlisted.offering_id
    WHERE o.tenant_id  = v_tenant_id
      AND o.season_id  = v_season_id
      AND o.day_of_week = v_today_dow
      AND o.status     IN ('active', 'full');

    -- Term enrolments (non-terminal)
    SELECT COUNT(*)::INTEGER
    INTO v_term_enrolments
    FROM engagements
    WHERE tenant_id = v_tenant_id
      AND season_id = v_season_id
      AND status NOT IN ('cancelled', 'withdrawn');

    -- Admin review queue
    SELECT COUNT(*)::INTEGER
    INTO v_admin_review
    FROM engagements
    WHERE tenant_id = v_tenant_id
      AND season_id = v_season_id
      AND status = 'admin_review';

    -- Pending payment (outstanding)
    SELECT COUNT(*)::INTEGER
    INTO v_pending_payment
    FROM engagements
    WHERE tenant_id = v_tenant_id
      AND season_id = v_season_id
      AND status = 'pending_payment';

    -- Finance summary — get_finance_summary returns TABLE; capture first row as JSONB
    SELECT to_jsonb(fs.*)
    INTO v_finance_summary
    FROM public.get_finance_summary(v_month_start, v_today_date) AS fs;

    IF v_finance_summary IS NULL THEN
        v_finance_summary := jsonb_build_object(
            'net_revenue_minor',       0,
            'payment_count',           0,
            'outstanding_engagements', 0,
            'failed_payments_7d',      0,
            'net_expenses_minor',      0
        );
    END IF;

    RETURN jsonb_build_object(
        'season_id',              v_season_id,
        'season_name',            v_season_name,
        'today_classes',          v_today_classes,
        'term_enrolments_count',  v_term_enrolments,
        'admin_review_count',     v_admin_review,
        'pending_payment_count',  v_pending_payment,
        'finance',                v_finance_summary
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_overview() TO authenticated;

COMMENT ON FUNCTION public.get_admin_dashboard_overview() IS
'Admin dashboard overview: today''s classes (ordered by start_time), term metrics, and
embedded MTD finance summary. Uses get_tenant_today() for timezone-aware date resolution:
(1) no tenants.timezone column → CURRENT_DATE (UTC server time);
(2) column NULL for tenant → CURRENT_DATE;
(3) column set → (NOW() AT TIME ZONE tz)::DATE.
Raises P0001 if no active season found — client must show "No active season" state, not
a generic error. Pre-merge gate: EXPLAIN ANALYZE on 50+ offering tenant must show
idx_offerings_season_dow_status in use (no Seq Scan on offerings).';
