use serde::Deserialize;
use serde_json::{Value, json};
use worker::{js_sys, wasm_bindgen::JsValue, *};

mod admin_users;
mod analytics;
mod analytics_response;
mod banners;
mod calendar;
mod card_excerpt;
mod card_news;
mod card_news_shell;
mod drafts;
mod feature_parts;
mod feature_shell;
mod geo_response;
mod glossary_raw;
mod home_lead;
mod home_response;
mod homepage_issues;
mod image_magic;
mod markdown;
mod marketing_journey;
mod marketing_output;
mod memorabilia;
mod memorabilia_csv;
mod naver_report;
mod ops_log;
mod post_routes;
mod post_text;
mod posts;
mod presets;
mod privacy;
mod public_ssr;
mod rate_limit;
mod referrers;
mod search_keywords;
mod search_report_validate;
mod seo;
mod settings;
mod share_meta;
mod tag_analytics;
mod tag_insights;
mod topic_news;
mod topic_shell;

const SYLLABLES: [&str; 14] = [
    "가", "나", "다", "라", "마", "바", "사", "아", "자", "차", "카", "타", "파", "하",
];
const INITIALS: [&str; 19] = [
    "가", "가", "나", "다", "다", "라", "마", "바", "바", "사", "사", "아", "자", "자", "차", "카",
    "타", "파", "하",
];
const MISC: &str = "기타";
const UNMATCHED: &str = "국문 미확정 용어";
const COLUMNS: &str =
    "id, bucket, term_ko, term_en, term_fr, description_ko, sort_order, created_at, updated_at";
const CACHE: &str = "public, max-age=300, s-maxage=300, stale-while-revalidate=1800";

// Pages owns authentication, permissions, CORS and CSRF; this module is not a standalone deployment.
#[event(fetch)]
pub async fn fetch(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    let path = url.path().trim_end_matches('/');
    let method = req.method();
    let result = match (method.clone(), path) {
        (Method::Post, "/__internal/country-catalog") => {
            memorabilia::country_catalog(&mut req).await
        }
        (Method::Post, "/__internal/memorabilia-csv-parse") => {
            memorabilia_csv::parse(&mut req).await
        }
        (Method::Post, "/__internal/memorabilia-upload-validate") => {
            memorabilia::validate_upload(&mut req).await
        }
        (Method::Post, "/__internal/memorabilia-public-slug") => {
            memorabilia::public_slug(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-id-response") => {
            memorabilia::id_response(&mut req, &env).await
        }
        (Method::Post, "/__internal/image-magic") => image_magic::detect(&mut req).await,
        (Method::Post, "/__internal/image-mime") => image_magic::mime(&mut req).await,
        (Method::Post, "/__internal/image-storage-key") => image_magic::storage_key(&mut req).await,
        (Method::Post, "/__internal/memorabilia-csv-export") => {
            memorabilia_csv::export(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-csv-prepare") => {
            memorabilia_csv::prepare(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-csv-import") => {
            memorabilia_csv::import(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-event-validate") => {
            memorabilia_csv::validate_event(&mut req).await
        }
        (Method::Post, "/__internal/memorabilia-events-bulk-validate") => {
            memorabilia::events_bulk_validate(&mut req, &env).await
        }
        (Method::Post, "/__internal/card-news-articles") => {
            card_news::articles(&mut req, &env).await
        }
        (Method::Post, "/__internal/card-news-articles-request") => {
            card_news::articles_request(&mut req, &env).await
        }
        (Method::Post, "/__internal/card-news-weekly") => card_news::weekly(&mut req, &env).await,
        (Method::Post, "/__internal/preset-mutation") => presets::mutation(&mut req, &env).await,
        (Method::Post, "/__internal/preset-normalize") => presets::normalize(&mut req).await,
        (Method::Post, "/__internal/preset-permissions-compare") => {
            presets::compare_permissions(&mut req).await
        }
        (Method::Post, "/__internal/settings-history-write") => {
            settings::history(&mut req, &env).await
        }
        (Method::Post, "/__internal/board-banner-normalize") => {
            settings::board_banner(&mut req).await
        }
        (Method::Post, "/__internal/settings-text-normalize") => {
            settings::normalize_text(&mut req).await
        }
        (Method::Post, "/__internal/board-copy-normalize") => settings::board_copy(&mut req).await,
        (Method::Post, "/__internal/translations-normalize") => {
            settings::translations(&mut req).await
        }
        (Method::Post, "/__internal/nav-labels-normalize") => settings::nav_labels(&mut req).await,
        (Method::Post, "/__internal/public-nav-labels") => {
            settings::public_nav_labels(&mut req, &env).await
        }
        (Method::Post, "/__internal/site-meta-normalize") => settings::site_meta(&mut req).await,
        (Method::Post, "/__internal/admin-user-activity") => {
            admin_users::activity(&mut req, &env).await
        }
        (Method::Post, "/__internal/admin-user-export") => {
            admin_users::export(&mut req, &env).await
        }
        (Method::Post, "/__internal/admin-user-read") => admin_users::read(&mut req, &env).await,
        (Method::Post, "/__internal/admin-identity-validate") => {
            admin_users::validate_identity(&mut req).await
        }
        (Method::Post, "/__internal/admin-permissions-validate") => {
            admin_users::validate_permissions(&mut req).await
        }
        (Method::Post, "/__internal/admin-user-create") => {
            admin_users::create(&mut req, &env).await
        }
        (Method::Post, "/__internal/admin-user-update") => {
            admin_users::update(&mut req, &env).await
        }
        (Method::Post, "/__internal/admin-user-delete") => {
            admin_users::delete(&mut req, &env).await
        }
        (Method::Post, "/__internal/admin-account-mutation") => {
            admin_users::account_mutation(&mut req, &env).await
        }
        (Method::Post, "/__internal/admin-login-data") => admin_users::login(&mut req, &env).await,
        (Method::Post, "/__internal/rate-ensure") => rate_limit::ensure(&env).await,
        (Method::Post, "/__internal/rate-enforce") => rate_limit::enforce(&mut req, &env).await,
        (Method::Post, "/__internal/operational-ensure") => ops_log::ensure(&env).await,
        (Method::Post, "/__internal/operational-write") => ops_log::write(&mut req, &env).await,
        (Method::Post, "/__internal/feature-history") => settings::feature_history(&env).await,
        (Method::Post, "/__internal/removed-tag-usage") => {
            settings::removed_tag_usage(&mut req, &env).await
        }
        (Method::Post, "/__internal/tag-usage") => settings::tag_usage(&mut req, &env).await,
        (Method::Post, "/__internal/meta-tag-pool") => settings::meta_tag_pool(&env).await,
        (Method::Post, "/__internal/llms-recent") => seo::llms_recent(&mut req, &env).await,
        (Method::Post, "/__internal/post-markdown-render") => seo::markdown(&mut req).await,
        (Method::Post, "/__internal/robots-render") => seo::robots(&mut req).await,
        (Method::Post, "/__internal/glossary-raw-rows") => {
            let rows = env.d1("DB")?.prepare("SELECT id, bucket, term_ko, term_en, term_fr, description_ko, sort_order, created_at, updated_at FROM glossary_terms").all().await?.results::<serde_json::Value>()?;
            Response::from_json(&serde_json::json!({"rows":rows}))
        }
        (Method::Post, "/__internal/glossary-raw-render") => glossary_raw::render_query(&env).await,
        (Method::Post, "/__internal/glossary-raw-page") => {
            glossary_raw::render_page(&mut req, &env).await
        }
        (Method::Post, "/__internal/tag-commit") => settings::tag_commit(&mut req, &env).await,
        (Method::Post, "/__internal/job-heartbeat") => {
            settings::job_heartbeat(&mut req, &env).await
        }
        (Method::Post, "/__internal/ai-log") => analytics::ai_log(&mut req, &env).await,
        (Method::Post, "/__internal/ai-score-extract") => {
            analytics::ai_score_extract(&mut req).await
        }
        (Method::Post, "/__internal/ai-score-prompt") => analytics::ai_score_prompt(&mut req).await,
        (Method::Post, "/__internal/admin-heatmap-range") => {
            analytics::heatmap_range(&mut req).await
        }
        (Method::Post, "/__internal/admin-analytics-range") => {
            analytics::admin_range(&mut req).await
        }
        (Method::Post, "/__internal/ai-score-history") => {
            analytics::score_history(&mut req, &env).await
        }
        (Method::Post, "/__internal/ai-score-history-response") => {
            analytics::score_history_response(&mut req).await
        }
        (Method::Post, "/__internal/analytics-ai-usage") => {
            analytics::ai_usage(&mut req, &env).await
        }
        (Method::Post, "/__internal/analytics-ai-usage-response") => {
            analytics::ai_usage_response(&mut req).await
        }
        (Method::Post, "/__internal/feature-definition-normalize") => {
            settings::feature_definition_normalize(&mut req).await
        }
        (Method::Post, "/__internal/score-history-filters") => {
            analytics::score_history_filters(&mut req).await
        }
        (Method::Post, "/__internal/ai-usage-range") => analytics::ai_usage_range(&mut req).await,
        (Method::Post, "/__internal/operations-assemble") => {
            analytics::operations_assemble(&mut req).await
        }
        (Method::Post, "/__internal/admin-operations-core") => {
            analytics::operations_core(&env).await
        }
        (Method::Post, "/__internal/admin-operations") => {
            analytics::operations(&mut req, &env).await
        }
        (Method::Post, "/__internal/naver-report-parse") => naver_report::parse(&mut req).await,
        (Method::Post, "/__internal/calendar-copy-normalize") => {
            settings::calendar_copy(&mut req).await
        }
        (Method::Post, "/__internal/search-report-validate") => {
            search_report_validate::validate(&mut req).await
        }
        (Method::Post, "/__internal/search-reports") => {
            settings::search_reports(&mut req, &env).await
        }
        (Method::Post, "/__internal/analytics-tag-posts") => {
            analytics::tag_posts(&mut req, &env).await
        }
        (Method::Post, "/__internal/analytics-marketing") => {
            analytics::marketing(&mut req, &env).await
        }
        (Method::Post, "/__internal/analytics-geo-response") => {
            geo_response::response(&mut req).await
        }
        (Method::Post, "/__internal/analytics-geo") => analytics::geo(&mut req, &env).await,
        (Method::Post, "/__internal/analytics-detail") => analytics::detail(&mut req, &env).await,
        (Method::Post, "/__internal/analytics-paths") => {
            analytics::path_metrics(&mut req, &env).await
        }
        (Method::Post, "/__internal/analytics-response") => {
            analytics_response::assemble(&mut req).await
        }
        (Method::Post, "/__internal/analytics-referrer-aggregate") => {
            referrers::aggregate(&mut req).await
        }
        (Method::Post, "/__internal/analytics-tag-aggregate") => {
            tag_analytics::aggregate(&mut req).await
        }
        (Method::Post, "/__internal/tag-insight-rankings") => {
            tag_insights::rankings(&mut req).await
        }
        (Method::Post, "/__internal/tag-insight-statistics") => {
            tag_insights::statistics(&mut req).await
        }
        (Method::Post, "/__internal/analytics-heatmaps") => {
            analytics::heatmaps(&mut req, &env).await
        }
        (Method::Post, "/__internal/analytics-series") => analytics::series(&mut req, &env).await,
        (Method::Post, "/__internal/analytics-baseline") => {
            analytics::baseline(&mut req, &env).await
        }
        (Method::Post, "/__internal/search-keywords-summary") => {
            search_keywords::summarize(&mut req).await
        }
        (Method::Post, "/__internal/search-referrers") => {
            analytics::search_referrers(&mut req, &env).await
        }
        (Method::Post, "/__internal/preset-catalog") => presets::catalog(&mut req, &env).await,
        (Method::Post, "/__internal/card-news-admin") => card_news::admin(&mut req, &env).await,
        (Method::Post, "/__internal/picks-order") => settings::picks_order(&mut req, &env).await,
        (Method::Post, "/__internal/draft-operation") => drafts::operation(&mut req, &env).await,
        (Method::Post, "/__internal/draft-create") => drafts::create(&mut req, &env).await,
        (Method::Post, "/__internal/draft-text-normalize") => {
            drafts::normalize_text(&mut req).await
        }
        (Method::Post, "/__internal/memorabilia-search-log") => {
            memorabilia::search_log(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-search-results") => {
            memorabilia::search_results(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-search-alias") => {
            memorabilia::search_alias(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-search-candidates") => {
            memorabilia::search_candidates(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-suggest") => {
            memorabilia::suggest(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-autocomplete") => {
            memorabilia::autocomplete(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-bulk-replace") => {
            memorabilia::bulk_replace(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-maintenance") => {
            memorabilia::maintenance(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-fts-upsert") => {
            memorabilia::fts_upsert(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-bulk-row") => {
            memorabilia::bulk_row(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-comments-admin-counts") => {
            memorabilia::comments_admin_counts(&env).await
        }
        (Method::Post, "/__internal/memorabilia-comments-admin-list") => {
            memorabilia::comments_admin_list(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-comment-status") => {
            memorabilia::comment_status(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-comment-moderate") => {
            memorabilia::comment_moderate(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-comment-validate") => {
            memorabilia::validate_comment(&mut req).await
        }
        (Method::Post, "/__internal/memorabilia-comments-list") => {
            memorabilia::comments_list(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-comment-create") => {
            memorabilia::comment_create(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-comment-get-secret") => {
            memorabilia::comment_get_secret(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-comment-delete") => {
            memorabilia::comment_delete(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-view-record") => {
            memorabilia::view_record(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-view-get") => {
            memorabilia::view_get(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-public-check") => {
            memorabilia::public_check(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-like-toggle") => {
            memorabilia::like_toggle(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-like-stats") => {
            memorabilia::like_stats(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-events-bulk-update") => {
            memorabilia::events_bulk_update(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-events-list") => {
            memorabilia::events_list(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-event-get") => {
            memorabilia::event_get(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-event-response") => {
            memorabilia::event_response(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-event-create") => {
            memorabilia::event_create(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-event-update") => {
            memorabilia::event_update(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-event-delete") => {
            memorabilia::event_delete(&mut req, &env).await
        }
        (Method::Post, "/__internal/event-category-exists") => {
            memorabilia::event_category_exists(&mut req, &env).await
        }
        (Method::Post, "/__internal/event-category-create") => {
            memorabilia::event_category_create(&mut req, &env).await
        }
        (Method::Post, "/__internal/event-category-list") => {
            memorabilia::event_category_list(&mut req, &env).await
        }
        (Method::Post, "/__internal/event-category-get") => {
            memorabilia::event_category_get(&mut req, &env).await
        }
        (Method::Post, "/__internal/event-category-update") => {
            memorabilia::event_category_update(&mut req, &env).await
        }
        (Method::Post, "/__internal/event-category-delete") => {
            memorabilia::event_category_delete(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-categories-list") => {
            memorabilia::categories_list(&env).await
        }
        (Method::Post, "/__internal/memorabilia-bulk-snapshot") => {
            memorabilia::bulk_snapshot(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-edit-snapshot") => {
            memorabilia::edit_snapshot(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-fts-snapshot") => {
            memorabilia::fts_snapshot(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-category-create") => {
            memorabilia::category_create(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-category-update") => {
            memorabilia::category_update(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-category-delete") => {
            memorabilia::category_delete(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-create") => {
            memorabilia::create(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-delete") => {
            memorabilia::delete(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-update") => {
            memorabilia::update(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-related") => {
            memorabilia::related(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-version") => {
            memorabilia::version(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-detail") => {
            memorabilia::detail(&mut req, &env).await
        }
        (Method::Post, "/__internal/memorabilia-list") => memorabilia::list(&mut req, &env).await,
        (Method::Post, "/__internal/banner-list") => banners::list(&mut req, &env).await,
        (Method::Post, "/__internal/banner-snapshot") => banners::snapshot(&env).await,
        (Method::Post, "/__internal/banner-commit") => banners::commit(&mut req, &env).await,
        (Method::Post, "/__internal/home-response") => home_response::assemble(&mut req).await,
        (Method::Post, "/__internal/home-lead-clear") => home_lead::clear(&mut req, &env).await,
        (Method::Post, "/__internal/home-lead-refresh") => home_lead::refresh(&mut req, &env).await,
        (Method::Post, "/__internal/home-lead-commit") => home_lead::commit(&mut req, &env).await,
        (Method::Post, "/__internal/privacy-snapshot") => privacy::snapshot(&env).await,
        (Method::Post, "/__internal/privacy-commit") => privacy::commit(&mut req, &env).await,
        (Method::Post, "/__internal/settings-snapshot") => settings::snapshot(&mut req, &env).await,
        (Method::Post, "/__internal/board-gap-normalize") => {
            settings::board_gap_normalize(&mut req).await
        }
        (Method::Post, "/__internal/tag-settings-plan") => {
            settings::tag_settings_plan(&mut req).await
        }
        (Method::Post, "/__internal/tag-settings-normalize") => {
            settings::tag_settings_normalize(&mut req).await
        }
        (Method::Post, "/__internal/calendar-tags-normalize") => {
            settings::calendar_tags_normalize(&mut req).await
        }
        (Method::Post, "/__internal/reference-sites-normalize") => {
            settings::reference_sites_normalize(&mut req).await
        }
        (Method::Post, "/__internal/wosm-country-aliases") => {
            settings::wosm_aliases(&mut req).await
        }
        (Method::Post, "/__internal/wosm-members-response") => {
            settings::wosm_members_response(&mut req).await
        }
        (Method::Post, "/__internal/wosm-members-normalize") => {
            settings::wosm_members_normalize(&mut req).await
        }
        (Method::Post, "/__internal/wosm-columns-normalize") => {
            settings::wosm_columns(&mut req).await
        }
        (Method::Post, "/__internal/wosm-fields-normalize") => {
            settings::wosm_fields(&mut req).await
        }
        (Method::Post, "/__internal/editors-normalize") => {
            settings::normalize_editors(&mut req).await
        }
        (Method::Post, "/__internal/score-rubric-normalize") => {
            settings::normalize_rubric(&mut req).await
        }
        (Method::Post, "/__internal/settings-single") => settings::single(&mut req, &env).await,
        (Method::Post, "/__internal/publish-switch-set") => {
            settings::publish_switch_set(&mut req, &env).await
        }
        (Method::Post, "/__internal/settings-read") => settings::read(&mut req, &env).await,
        (Method::Post, "/__internal/settings-save") => settings::save(&mut req, &env).await,
        (Method::Post, "/__internal/public-ssr") => public_ssr::render(&mut req, &env).await,
        (Method::Post, "/__internal/members-render") => public_ssr::members_render(&mut req).await,
        (Method::Post, "/__internal/privacy-render") => public_ssr::privacy_render(&mut req).await,
        (Method::Post, "/__internal/public-board-render") => {
            public_ssr::board_render(&mut req).await
        }
        (Method::Post, "/__internal/public-schema") => {
            public_ssr::schema_data(&mut req, &env).await
        }
        (Method::Post, "/__internal/sitemap") => seo::sitemap(&mut req, &env).await,
        (Method::Post, "/__internal/sitemap-news") => seo::news(&mut req, &env).await,
        (Method::Post, "/__internal/rss") => seo::rss(&mut req, &env).await,
        (Method::Post, "/__internal/publish-due") => post_routes::publish_due(&env).await,
        (Method::Post, "/__internal/site-visit") => analytics::visit(&mut req, &env).await,
        (Method::Post, "/__internal/site-visit-record") => {
            analytics::record_visit(&mut req, &env).await
        }
        (Method::Post, "/__internal/site-visit-ensure") => {
            analytics::ensure_visit_columns(&env).await
        }
        (Method::Post, "/__internal/post-engagement") => {
            analytics::engagement(&mut req, &env).await
        }
        (Method::Post, "/__internal/post-engagement-record") => {
            analytics::record_engagement(&mut req, &env).await
        }
        (Method::Post, "/__internal/calendar-list") => calendar::list(&env).await,
        (Method::Post, "/__internal/calendar-dates") => calendar::dates(&mut req).await,
        (Method::Post, "/__internal/calendar-normalize") => {
            calendar::normalize_input(&mut req).await
        }
        (Method::Post, "/__internal/calendar-ensure") => calendar::ensure(&env).await,
        (Method::Post, "/__internal/calendar-create") => {
            calendar::write(&mut req, &env, false).await
        }
        (Method::Post, "/__internal/calendar-update") => {
            calendar::write(&mut req, &env, true).await
        }
        (Method::Post, "/__internal/calendar-delete") => calendar::delete(&mut req, &env).await,
        (Method::Post, "/__internal/article-export") => {
            post_routes::article_export(&mut req, &env).await
        }
        (Method::Post, "/__internal/visit-analytics") => post_routes::visit_analytics(&env).await,
        (Method::Post, "/__internal/visit-analytics-response") => {
            post_routes::visit_analytics_response(&env).await
        }
        (Method::Post, "/__internal/post-update") => post_routes::update(&mut req, &env).await,
        (Method::Post, "/__internal/post-delete") => post_routes::delete(&mut req, &env).await,
        (Method::Post, "/__internal/post-admin-read") => {
            post_routes::admin_read(&mut req, &env).await
        }
        (Method::Post, "/__internal/post-create") => post_routes::create(&mut req, &env).await,
        (Method::Post, "/__internal/posts") => posts::list(&mut req, &env).await,
        (Method::Post, "/__internal/post-tags") => post_routes::tags(&mut req, &env).await,
        (Method::Post, "/__internal/post-tags-query") => {
            post_routes::tags_query(&mut req, &env).await
        }
        (Method::Post, "/__internal/post-features") => post_routes::features(&mut req, &env).await,
        (Method::Post, "/__internal/post-features-query") => {
            post_routes::features_query(&mut req, &env).await
        }
        (Method::Post, "/__internal/feature-collection") => {
            post_routes::feature_collection(&mut req, &env).await
        }
        (Method::Post, "/__internal/topic-posts") => post_routes::topic_posts(&mut req, &env).await,
        (Method::Post, "/__internal/post-popular") => post_routes::popular(&mut req, &env).await,
        (Method::Post, "/__internal/site-history-source") => {
            homepage_issues::history_source(&mut req, &env).await
        }
        (Method::Post, "/__internal/site-history-sources") => {
            homepage_issues::history_sources(&mut req, &env).await
        }
        (Method::Post, "/__internal/site-history-merge") => {
            homepage_issues::history_merge(&mut req).await
        }
        (Method::Post, "/__internal/homepage-issue-list") => {
            homepage_issues::list(&mut req, &env).await
        }
        (Method::Post, "/__internal/homepage-issue-get") => {
            homepage_issues::get(&mut req, &env).await
        }
        (Method::Post, "/__internal/homepage-issue-status") => {
            homepage_issues::status(&mut req, &env).await
        }
        (Method::Post, "/__internal/homepage-issue-write") => {
            homepage_issues::write(&mut req, &env).await
        }
        (Method::Post, "/__internal/homepage-issue-find") => {
            homepage_issues::find(&mut req, &env).await
        }
        (Method::Post, "/__internal/homepage-issue-ensure") => homepage_issues::ensure(&env).await,
        (Method::Post, "/__internal/homepage-issue-recent") => {
            homepage_issues::recent_count(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-posts") => post_routes::home_posts(&mut req, &env).await,
        (Method::Post, "/__internal/home-sections") => {
            post_routes::home_sections(&mut req, &env).await
        }
        (Method::Post, "/__internal/post-detail") => post_routes::detail(&mut req, &env).await,
        (Method::Post, "/__internal/post-image-frame") => {
            post_routes::normalize_image_frame(&mut req).await
        }
        (Method::Post, "/__internal/post-public-serialize") => {
            post_routes::public_post(&mut req).await
        }
        (Method::Post, "/__internal/post-text-validate") => {
            post_text::validate_input(&mut req).await
        }
        (Method::Post, "/__internal/post-stats") => post_routes::stats(&mut req, &env).await,
        (Method::Post, "/__internal/home-rails") => post_routes::home_rails(&mut req, &env).await,
        (Method::Post, "/__internal/home-rails-cards") => {
            post_routes::home_rails_cards(&mut req, &env).await
        }
        (Method::Post, "/__internal/share-meta-render") => share_meta::render(&mut req).await,
        (Method::Post, "/__internal/card-news-shell") => card_news_shell::render(&mut req).await,
        (Method::Post, "/__internal/topic-news-render") => topic_news::render(&mut req).await,
        (Method::Post, "/__internal/topic-shell-render") => topic_shell::render(&mut req).await,
        (Method::Post, "/__internal/topic-page-render") => {
            topic_shell::render_combined(&mut req).await
        }
        (Method::Post, "/__internal/feature-parts-render") => feature_parts::render(&mut req).await,
        (Method::Post, "/__internal/feature-shell-render") => feature_shell::render(&mut req).await,
        (Method::Post, "/__internal/feature-page-render") => {
            feature_shell::render_combined(&mut req).await
        }
        (Method::Post, "/__internal/public-canonical") => public_ssr::canonical(&mut req).await,
        (Method::Post, "/__internal/home-ssr-minis") => public_ssr::home_minis(&mut req).await,
        (Method::Post, "/__internal/post-likes") => post_routes::likes(&mut req, &env).await,
        (Method::Post, "/__internal/post-history-record") => {
            post_routes::history_record(&mut req, &env).await
        }
        (Method::Post, "/__internal/post-public-check") => {
            post_routes::public_check(&mut req, &env).await
        }
        (Method::Post, "/__internal/post-like-add") => post_routes::like_add(&mut req, &env).await,
        (Method::Post, "/__internal/post-reorder") => post_routes::reorder(&mut req, &env).await,
        (Method::Post, "/__internal/post-reorder-reset") => post_routes::reorder_reset(&env).await,
        (Method::Post, "/__internal/post-history") => post_routes::history(&mut req, &env).await,
        (Method::Post, "/__internal/post-og-cover") => post_routes::og_cover(&mut req, &env).await,
        (Method::Post, "/__internal/post-cover") => post_routes::cover(&mut req, &env).await,
        (Method::Post, "/__internal/post-views") => post_routes::views(&mut req, &env).await,
        (Method::Post, "/__internal/related-manual") => {
            post_routes::related_manual(&mut req, &env).await
        }
        (Method::Post, "/__internal/related-auto") => {
            post_routes::related_auto(&mut req, &env).await
        }
        (Method::Post, "/__internal/related-feature") => {
            post_routes::related_feature(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-hero-manual") => {
            post_routes::hero_manual(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-hero") => post_routes::home_hero(&mut req, &env).await,
        (Method::Post, "/__internal/home-hero-from-settings") => {
            post_routes::home_hero_from_settings(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-hero-auto") => {
            post_routes::hero_auto(&mut req, &env).await
        }
        (Method::Post, "/__internal/hero-write-normalize") => {
            post_routes::normalize_hero_write(&mut req).await
        }
        (Method::Post, "/__internal/home-media-normalize") => {
            post_routes::normalize_home_media(&mut req).await
        }
        (Method::Post, "/__internal/home-lead") => post_routes::home_lead(&mut req, &env).await,
        (Method::Post, "/__internal/home-lead-post") => {
            post_routes::home_lead_post(&mut req, &env).await
        }
        (Method::Post, "/__internal/footer-count") => {
            post_routes::footer_count(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-footer-analytics") => {
            post_routes::home_footer_analytics(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-hydrate") => {
            post_routes::home_hydrate(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-lead-rank") => {
            post_routes::home_lead_rank(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-setting") => {
            post_routes::home_setting(&mut req, &env).await
        }
        (Method::Post, "/__internal/home-lead-state") => post_routes::home_lead_state(&env).await,
        (Method::Get, "/api/glossary") => list(&url, &env, false).await,
        (Method::Get, "/api/glossary/bot") => list(&url, &env, true).await,
        (Method::Post, "/api/glossary") => save(&mut req, &env, None).await,
        (Method::Put | Method::Delete, _) if path.starts_with("/api/glossary/") => {
            let id = path
                .trim_start_matches("/api/glossary/")
                .parse::<f64>()
                .ok()
                .filter(|id| id.is_finite() && *id >= 1.0);
            match id {
                Some(id) if method == Method::Delete => delete(&env, id).await,
                Some(id) => save(&mut req, &env, Some(id)).await,
                None => response(json!({"error":"Invalid ID"}), 400, "application/json", None),
            }
        }
        _ => response(json!({"error":"Not Found"}), 404, "application/json", None),
    };
    match result {
        Ok(response) => Ok(response),
        Err(_) => {
            // Do not include SQL, request bodies, or database errors in public responses/logs.
            console_error!("Rust server request failed: {} {}", method, path);
            let (body, content_type, cache) = if method == Method::Get && path.ends_with("/bot") {
                (
                    json!({"error":"용어집 데이터를 불러오지 못했습니다."}),
                    "application/json",
                    Some(CACHE),
                )
            } else if path.starts_with("/__internal/") {
                (json!({"error":"Database error"}), "application/json", None)
            } else if method == Method::Get {
                (
                    json!({"buckets":buckets(false),"items":[]}),
                    "application/json; charset=utf-8",
                    None,
                )
            } else {
                (
                    json!({"error":"Database error"}),
                    if method == Method::Post {
                        "application/json; charset=utf-8"
                    } else {
                        "application/json"
                    },
                    None,
                )
            };
            response(body, 500, content_type, cache)
        }
    }
}

fn buckets(bot: bool) -> Vec<&'static str> {
    let mut result = SYLLABLES.to_vec();
    if !bot {
        result.extend([MISC, UNMATCHED]);
    }
    result
}

fn text<'a>(row: &'a Value, key: &str) -> &'a str {
    row.get(key).and_then(Value::as_str).unwrap_or("")
}

fn infer_bucket(term: &str) -> Option<&'static str> {
    let first = trim(term).chars().next()? as u32;
    if !(0xac00..=0xd7a3).contains(&first) {
        return None;
    }
    Some(INITIALS[((first - 0xac00) / 588) as usize])
}

fn row_bucket(row: &Value, bot: bool) -> String {
    let ko = trim(text(row, "term_ko"));
    let en = trim(text(row, "term_en"));
    let fr = trim(text(row, "term_fr"));
    if !bot {
        if [ko, en, fr]
            .iter()
            .any(|value| value.starts_with(|c: char| c.is_ascii_digit()))
        {
            return MISC.into();
        }
        let present = |s: &str| !s.is_empty() && s != "-" && s != "—";
        if !present(ko) && (present(en) || present(fr)) {
            return UNMATCHED.into();
        }
    }
    infer_bucket(ko)
        .unwrap_or_else(|| {
            let stored = text(row, "bucket");
            if stored.is_empty() { "가" } else { stored }
        })
        .into()
}

// Match String.trim(), including BOM and excluding the Unicode-only U+0085.
fn trim(value: &str) -> &str {
    value.trim_matches(|c| matches!(c, '\u{0009}'..='\u{000d}' | '\u{0020}' | '\u{00a0}' | '\u{1680}' |
        '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'))
}

fn query(url: &Url, name: &str, fallback: &str) -> String {
    url.query_pairs()
        .find(|(key, _)| key == name)
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.into())
}

async fn list(url: &Url, env: &Env, bot: bool) -> Result<Response> {
    let mut items = env
        .d1("DB")?
        .prepare(format!("SELECT {COLUMNS} FROM glossary_terms"))
        .all()
        .await?
        .results::<Value>()?;
    for item in &mut items {
        item["bucket"] = row_bucket(item, bot).into();
    }
    let order = buckets(bot);
    let locales = js_sys::Array::of1(&JsValue::from_str("ko"));
    let options = js_sys::Object::new();
    items.sort_by(|a, b| {
        let index = |row: &Value| {
            order
                .iter()
                .position(|bucket| *bucket == text(row, "bucket"))
                .map(|i| i as i32)
                .unwrap_or(-1)
        };
        let number = |row: &Value, key| row.get(key).and_then(Value::as_f64).unwrap_or(0.0);
        let term = |row: &Value| {
            ["term_ko", "term_en", "term_fr"]
                .iter()
                .find_map(|key| {
                    let value = text(row, key);
                    if value.is_empty() {
                        None
                    } else {
                        Some(value.to_owned())
                    }
                })
                .unwrap_or_default()
        };
        index(a)
            .cmp(&index(b))
            .then_with(|| number(a, "sort_order").total_cmp(&number(b, "sort_order")))
            .then_with(|| {
                js_sys::JsString::from(term(a))
                    .locale_compare(&term(b), &locales, &options)
                    .cmp(&0)
            })
            .then_with(|| number(a, "id").total_cmp(&number(b, "id")))
    });
    if bot {
        return bot_response(items, url);
    }
    let bucket = trim(&query(url, "bucket", "")).to_owned();
    let search = trim(&query(url, "q", "")).to_lowercase();
    items.retain(|row| {
        (bucket.is_empty() || bucket == "all" || text(row, "bucket") == bucket)
            && (search.is_empty()
                || ["term_ko", "term_en", "term_fr", "description_ko", "bucket"]
                    .iter()
                    .any(|key| text(row, key).to_lowercase().contains(&search)))
    });
    let mut body = json!({"source":"BP미디어 스카우트 용어집","audience":"public-external-app",
        "generated_at":String::from(js_sys::Date::new_0().to_iso_string()),"buckets":order,"count":items.len(),"items":items});
    let view = trim(&query(url, "view", "flat")).to_lowercase();
    if view == "grouped" || view == "buckets" {
        body["groups"] = order
            .iter()
            .filter_map(|bucket| {
                let group: Vec<&Value> = items
                    .iter()
                    .filter(|row| text(row, "bucket") == *bucket)
                    .collect();
                if group.is_empty() {
                    None
                } else {
                    Some(json!({"bucket":bucket,"items":group}))
                }
            })
            .collect::<Vec<_>>()
            .into();
    }
    let cache = if query(url, "scope", "") == "admin" {
        "no-store"
    } else {
        CACHE
    };
    response(body, 200, "application/json; charset=utf-8", Some(cache))
}

fn bot_response(mut items: Vec<Value>, url: &Url) -> Result<Response> {
    for row in &mut items {
        let search = ["term_ko", "term_en", "term_fr", "description_ko"]
            .iter()
            .map(|key| text(row, key))
            .filter(|value| !value.is_empty())
            .collect::<Vec<_>>()
            .join(" | ");
        row.as_object_mut().unwrap().remove("sort_order");
        row["search_text"] = search.into();
    }
    let format = trim(&query(url, "format", "json")).to_lowercase();
    if format == "text" || format == "txt" {
        let body = items
            .iter()
            .map(|row| {
                let field = |key| {
                    let value = text(row, key);
                    if value.is_empty() { "-" } else { value }
                };
                format!(
                    "[{}]\nKO: {}\nEN: {}\nFR: {}\nDESC: {}\n",
                    text(row, "bucket"),
                    field("term_ko"),
                    field("term_en"),
                    field("term_fr"),
                    field("description_ko")
                )
            })
            .collect::<Vec<_>>()
            .join("\n");
        let mut result = Response::ok(body)?;
        result
            .headers_mut()
            .set("Content-Type", "text/plain; charset=utf-8")?;
        result.headers_mut().set("Cache-Control", CACHE)?;
        return Ok(result);
    }
    response(
        json!({"source":"BP미디어 스카우트 용어집","audience":"public-machine-readable",
        "generated_at":String::from(js_sys::Date::new_0().to_iso_string()),"buckets":buckets(true),"count":items.len(),"items":items}),
        200,
        "application/json",
        Some(CACHE),
    )
}

#[derive(Deserialize)]
struct Input {
    bucket: String,
    term_ko: String,
    term_en: String,
    term_fr: String,
    description_ko: String,
    sort_order: Option<f64>,
    #[serde(default)]
    expected_updated_at: String,
}

async fn save(req: &mut Request, env: &Env, id: Option<f64>) -> Result<Response> {
    // Input is normalized with the existing JS helper before crossing into Wasm.
    let body: Input = req.json().await?;
    if !buckets(false).contains(&body.bucket.as_str()) {
        return response(
            json!({"error":"올바른 분류를 선택해주세요"}),
            400,
            "application/json",
            None,
        );
    }
    let storage_bucket = if SYLLABLES.contains(&body.bucket.as_str()) {
        body.bucket.as_str()
    } else {
        "가"
    };
    let mut args = vec![
        storage_bucket.into(),
        body.term_ko.into(),
        body.term_en.into(),
        body.term_fr.into(),
        body.description_ko.into(),
        body.sort_order
            .map(JsValue::from_f64)
            .unwrap_or(JsValue::NULL),
    ];
    let sql = if let Some(id) = id {
        args.extend([
            JsValue::from_f64(id),
            body.expected_updated_at.clone().into(),
            body.expected_updated_at.into(),
        ]);
        format!(
            "UPDATE glossary_terms SET bucket = ?, term_ko = ?, term_en = ?, term_fr = ?, description_ko = ?, sort_order = ?, updated_at = CASE WHEN julianday(updated_at) >= julianday('now') THEN strftime('%Y-%m-%d %H:%M:%f', updated_at, '+0.001 seconds') ELSE strftime('%Y-%m-%d %H:%M:%f', 'now') END WHERE id = ? AND (? = '' OR updated_at = ?) RETURNING {COLUMNS}"
        )
    } else {
        format!(
            "INSERT INTO glossary_terms (bucket, term_ko, term_en, term_fr, description_ko, sort_order) VALUES (?, ?, ?, ?, ?, ?) RETURNING {COLUMNS}"
        )
    };
    let db = env.d1("DB")?;
    let row = db.prepare(sql).bind(&args)?.first::<Value>(None).await?;
    if let Some(mut row) = row {
        row["bucket"] = body.bucket.into();
        return response(
            json!({"item":row}),
            if id.is_some() { 200 } else { 201 },
            if id.is_some() {
                "application/json"
            } else {
                "application/json; charset=utf-8"
            },
            None,
        );
    }
    if let Some(id) = id {
        let existing = db
            .prepare("SELECT id FROM glossary_terms WHERE id = ?")
            .bind(&[JsValue::from_f64(id)])?
            .first::<Value>(None)
            .await?;
        return if existing.is_some() {
            response(
                json!({"error":"다른 변경이 감지되었습니다. 입력을 유지했습니다. 최신 용어를 확인한 뒤 다시 수정해주세요."}),
                409,
                "application/json",
                None,
            )
        } else {
            response(
                json!({"error":"항목을 찾을 수 없습니다"}),
                404,
                "application/json",
                None,
            )
        };
    }
    Err(Error::RustError("Insert returned no row".into()))
}

async fn delete(env: &Env, id: f64) -> Result<Response> {
    env.d1("DB")?
        .prepare("DELETE FROM glossary_terms WHERE id = ?")
        .bind(&[JsValue::from_f64(id)])?
        .run()
        .await?;
    response(json!({"ok":true}), 200, "application/json", None)
}

fn response(body: Value, status: u16, content_type: &str, cache: Option<&str>) -> Result<Response> {
    let mut result = Response::from_json(&body)?.with_status(status);
    result.headers_mut().set("Content-Type", content_type)?;
    if let Some(cache) = cache {
        result.headers_mut().set("Cache-Control", cache)?;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn buckets_preserve_public_and_bot_contracts() {
        assert_eq!(infer_bucket("까치"), Some("가"));
        assert_eq!(infer_bucket("하이킹"), Some("하"));
        assert_eq!(
            row_bucket(&json!({"term_ko":"123", "bucket":"가"}), false),
            MISC
        );
        assert_eq!(
            row_bucket(
                &json!({"term_ko":"", "term_en":"Scout", "bucket":"가"}),
                false
            ),
            UNMATCHED
        );
        assert_eq!(
            row_bucket(
                &json!({"term_ko":"", "term_en":"Scout", "bucket":"가"}),
                true
            ),
            "가"
        );
        assert_eq!(buckets(false).len(), 16);
        assert_eq!(buckets(true).len(), 14);
    }
}
