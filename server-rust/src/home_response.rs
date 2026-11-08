use serde::Deserialize;
use serde_json::{Value, json};
use worker::*;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
    site_meta: Value,
    nav_labels: Value,
    translations: Value,
    ticker: Value,
    stats: Value,
    footer_analytics: Value,
    hero: Value,
    lead: Value,
    latest: Value,
    popular: Value,
    picks: Value,
    banners: Value,
    korea: Value,
    apr: Value,
    wosm: Value,
    people: Value,
    issues: Value,
}
pub async fn assemble(req: &mut Request) -> Result<Response> {
    let o: Input = req.json().await?;
    Response::from_json(
        &json!({"site_meta":o.site_meta,"nav_labels":o.nav_labels,"translations":{"strings":o.translations},"ticker":{"items":o.ticker},"stats":o.stats,"analytics":o.footer_analytics,"hero":o.hero,"lead":o.lead,
 "latest":{"posts":o.latest},"popular":{"posts":o.popular},"picks":{"posts":o.picks},"banners":o.banners,
 "columns":{"korea":{"posts":o.korea},"apr":{"posts":o.apr},"wosm":{"posts":o.wosm},"people":{"posts":o.people}},"issues":o.issues}),
    )
}
