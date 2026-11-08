use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use worker::{js_sys, *};

#[derive(Deserialize)]
struct InsightPost {
    id: Value,
    title: String,
    category: String,
    #[serde(default)]
    publish_at: Value,
    #[serde(default)]
    created_at: Value,
    header_tokens: Vec<String>,
    meta_tokens: Vec<String>,
}
#[derive(Deserialize)]
struct StatisticsInput {
    posts: Vec<InsightPost>,
}

#[derive(Default)]
struct Category {
    name: String,
    posts: usize,
    with_meta: usize,
    meta_sum: usize,
}

pub async fn statistics(req: &mut Request) -> Result<Response> {
    let input: StatisticsInput = req.json().await?;
    let total = input.posts.len();
    let mut tag_missing = 0usize;
    let mut meta_missing = 0usize;
    let mut meta_sum = 0usize;
    let mut meta_nonempty = 0usize;
    let mut headers = HashSet::new();
    let mut metas = HashSet::new();
    let mut categories: Vec<Category> = Vec::new();
    let mut indices: HashMap<String, usize> = HashMap::new();
    let mut missing = Vec::new();
    for post in input.posts {
        let no_header = post.header_tokens.is_empty();
        let no_meta = post.meta_tokens.is_empty();
        tag_missing += usize::from(no_header);
        meta_missing += usize::from(no_meta);
        headers.extend(post.header_tokens);
        let count = post.meta_tokens.len();
        metas.extend(post.meta_tokens);
        if !no_meta {
            meta_sum += count;
            meta_nonempty += 1;
        }
        let index = *indices.entry(post.category.clone()).or_insert_with(|| {
            categories.push(Category {
                name: post.category.clone(),
                ..Category::default()
            });
            categories.len() - 1
        });
        let category = &mut categories[index];
        category.posts += 1;
        if !no_meta {
            category.with_meta += 1;
            category.meta_sum += count;
        }
        if no_header || no_meta {
            missing.push(json!({"id":post.id,"title":post.title,"category":post.category,"tag_missing":no_header,"meta_missing":no_meta}));
        }
    }
    categories.sort_by(|a, b| {
        let a_avg = if a.with_meta == 0 {
            0.0
        } else {
            a.meta_sum as f64 / a.with_meta as f64
        };
        let b_avg = if b.with_meta == 0 {
            0.0
        } else {
            b.meta_sum as f64 / b.with_meta as f64
        };
        b_avg.total_cmp(&a_avg).then_with(|| b.posts.cmp(&a.posts))
    });
    let category_avg:Vec<Value>=categories.into_iter().map(|c| json!({"category":c.name,"posts":c.posts,"with_meta":c.with_meta,"meta_sum":c.meta_sum,"avg_meta":if c.with_meta==0 {0.0} else {c.meta_sum as f64/c.with_meta as f64}})).collect();
    Response::from_json(
        &json!({"total_posts":total,"tag_missing":tag_missing,"meta_missing":meta_missing,"unique_header_tags":headers.len(),"unique_meta_tags":metas.len(),"avg_meta_per_post":if meta_nonempty==0 {0.0} else {meta_sum as f64/meta_nonempty as f64},"category_avg":category_avg,"missing_posts":missing}),
    )
}

#[derive(Default)]
struct Ranking {
    tag: String,
    count: usize,
    categories: Vec<(String, usize)>,
    headers: Vec<(String, usize)>,
}

fn increment(entries: &mut Vec<(String, usize)>, value: &str) {
    if let Some((_, count)) = entries.iter_mut().find(|(name, _)| name == value) {
        *count += 1;
    } else {
        entries.push((value.to_owned(), 1));
    }
}

fn winner(entries: &[(String, usize)]) -> &str {
    let mut best = "";
    let mut max = 0;
    for (name, count) in entries {
        if *count > max {
            best = name;
            max = *count;
        }
    }
    best
}

fn ranking_entry<'a>(
    entries: &'a mut Vec<Ranking>,
    indices: &mut HashMap<String, usize>,
    tag: &str,
) -> &'a mut Ranking {
    let index = *indices.entry(tag.to_owned()).or_insert_with(|| {
        entries.push(Ranking {
            tag: tag.to_owned(),
            ..Ranking::default()
        });
        entries.len() - 1
    });
    &mut entries[index]
}

pub async fn rankings(req: &mut Request) -> Result<Response> {
    let input: StatisticsInput = req.json().await?;
    let total = input.posts.len();
    let (mut headers, mut metas) = (Vec::new(), Vec::new());
    let (mut header_indices, mut meta_indices) = (HashMap::new(), HashMap::new());
    for post in &input.posts {
        for tag in &post.header_tokens {
            ranking_entry(&mut headers, &mut header_indices, tag).count += 1;
        }
        for tag in &post.meta_tokens {
            let entry = ranking_entry(&mut metas, &mut meta_indices, tag);
            entry.count += 1;
            increment(&mut entry.categories, &post.category);
            for header in &post.header_tokens {
                increment(&mut entry.headers, header);
            }
        }
    }
    let ko = js_sys::Array::new();
    ko.push(&"ko".into());
    let options = js_sys::Object::new();
    let compare = |a: &Ranking, b: &Ranking| {
        b.count.cmp(&a.count).then_with(|| {
            js_sys::JsString::from(a.tag.as_str())
                .locale_compare(&b.tag, &ko, &options)
                .cmp(&0)
        })
    };
    headers.sort_by(compare);
    metas.sort_by(compare);
    let header_ranking: Vec<Value> = headers.iter().map(|r| json!({"tag":r.tag,"count":r.count,"pct":if total == 0 {0.0} else {r.count as f64 / total as f64}})).collect();
    let meta_ranking: Vec<Value> = metas.iter().map(|r| json!({"tag":r.tag,"count":r.count,"top_category":winner(&r.categories),"top_header":winner(&r.headers)})).collect();
    let max_count = metas.iter().map(|r| r.count).max().unwrap_or(1).max(1);
    let nodes: Vec<Value> = metas
        .iter()
        .map(|r| {
            json!({
                "id":r.tag,"label":r.tag,"count":r.count,
                "size":(10.0 + (r.count as f64 / max_count as f64) * 30.0).round(),
                "top_header":winner(&r.headers),"top_category":winner(&r.categories)
            })
        })
        .collect();
    let mut pairs: Vec<(String, String, usize)> = Vec::new();
    let mut pair_indices: HashMap<String, usize> = HashMap::new();
    for post in &input.posts {
        for i in 0..post.meta_tokens.len() {
            for j in i + 1..post.meta_tokens.len() {
                let a = &post.meta_tokens[i];
                let b = &post.meta_tokens[j];
                // JavaScript's default string sort compares UTF-16 code units.
                let key = if a.encode_utf16().cmp(b.encode_utf16()).is_gt() {
                    format!("{b}\u{0001}{a}")
                } else {
                    format!("{a}\u{0001}{b}")
                };
                let index = *pair_indices.entry(key).or_insert_with(|| {
                    pairs.push((a.clone(), b.clone(), 0));
                    pairs.len() - 1
                });
                pairs[index].2 += 1;
            }
        }
    }
    let health = build_health(total, &metas, &pairs);
    let coverage = build_coverage(&input.posts);
    let suggestions = build_suggestions(&metas, &headers, &pairs, total);
    pairs.sort_by_key(|pair| std::cmp::Reverse(pair.2));
    let links: Vec<Value> = pairs
        .iter()
        .map(|(a, b, count)| json!({"source":a,"target":b,"count":count}))
        .collect();
    Response::from_json(
        &json!({"header_ranking":header_ranking,"meta_ranking":meta_ranking,"graph":{"nodes":nodes,"links":links},"health":health,"coverage":coverage,"suggestions":suggestions}),
    )
}

fn edit_distance(a: &[u16], b: &[u16]) -> usize {
    if a.len().abs_diff(b.len()) > 3 {
        return usize::MAX;
    }
    let mut previous: Vec<usize> = (0..=b.len()).collect();
    let mut current = vec![0; b.len() + 1];
    for (i, left) in a.iter().enumerate() {
        current[0] = i + 1;
        for (j, right) in b.iter().enumerate() {
            current[j + 1] = (current[j] + 1)
                .min(previous[j + 1] + 1)
                .min(previous[j] + usize::from(left != right));
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[b.len()]
}

fn root(parent: &mut [usize], mut index: usize) -> usize {
    while parent[index] != index {
        parent[index] = parent[parent[index]];
        index = parent[index];
    }
    index
}

fn build_health(total: usize, metas: &[Ranking], pairs: &[(String, String, usize)]) -> Value {
    let isolated: Vec<&str> = metas
        .iter()
        .filter(|r| r.count == 1)
        .map(|r| r.tag.as_str())
        .collect();
    let threshold = 3.max(((total as f64) * 0.3).floor() as usize);
    let common: Vec<Value> = metas.iter().filter(|r| r.count >= threshold).map(|r| json!({"tag":r.tag,"count":r.count,"pct":if total == 0 {0.0} else {r.count as f64/total as f64}})).collect();
    let mut suspects = Vec::new();
    let sample = &metas[..metas.len().min(400)];
    'outer: for (i, a) in sample.iter().enumerate() {
        let au: Vec<u16> = a.tag.encode_utf16().collect();
        for b in &sample[i + 1..] {
            if suspects.len() >= 60 {
                break 'outer;
            }
            let bu: Vec<u16> = b.tag.encode_utf16().collect();
            let mut reasons = Vec::new();
            if au.len() >= 3 && bu.len() >= 3 && (a.tag.contains(&b.tag) || b.tag.contains(&a.tag))
            {
                reasons.push("부분 포함".to_owned());
            }
            let distance = edit_distance(&au, &bu);
            if au.len().max(bu.len()) >= 4 && (1..=2).contains(&distance) {
                reasons.push(format!("편집거리 {distance}"));
            }
            if !reasons.is_empty() {
                suspects.push(json!({"left":a.tag,"right":b.tag,"left_count":a.count,"right_count":b.count,"reasons":reasons}));
            }
        }
    }
    let indices: HashMap<&str, usize> = metas
        .iter()
        .enumerate()
        .map(|(i, r)| (r.tag.as_str(), i))
        .collect();
    let mut parent: Vec<usize> = (0..metas.len()).collect();
    for (a, b, _) in pairs {
        if let (Some(&ai), Some(&bi)) = (indices.get(a.as_str()), indices.get(b.as_str())) {
            let ar = root(&mut parent, ai);
            let br = root(&mut parent, bi);
            if ar != br {
                parent[ar] = br;
            }
        }
    }
    let mut components: Vec<Vec<usize>> = Vec::new();
    let mut component_indices = HashMap::new();
    for i in 0..metas.len() {
        let r = root(&mut parent, i);
        let index = *component_indices.entry(r).or_insert_with(|| {
            components.push(Vec::new());
            components.len() - 1
        });
        components[index].push(i);
    }
    let total_components = components.len();
    let mut clusters: Vec<(usize, Value)> = components
        .into_iter()
        .filter(|c| (2..=5).contains(&c.len()))
        .map(|c| {
            let sum: usize = c.iter().map(|i| metas[*i].count).sum();
            let members: Vec<&str> = c.iter().map(|i| metas[*i].tag.as_str()).collect();
            (
                sum,
                json!({"size":c.len(),"members":members,"total_articles":sum}),
            )
        })
        .collect();
    clusters.sort_by_key(|c| c.0);
    let clusters: Vec<Value> = clusters
        .into_iter()
        .take(20)
        .map(|(_, value)| value)
        .collect();
    json!({"isolated_tags":isolated,"isolated_tags_count":isolated.len(),"overly_common_threshold":threshold,"overly_common":common,"duplicate_suspects":suspects,"isolated_clusters":clusters,"total_components":total_components})
}

fn build_coverage(posts: &[InsightPost]) -> Value {
    let mut headers: Vec<Ranking> = Vec::new();
    let mut indices = HashMap::new();
    let mut months: Vec<(String, usize)> = Vec::new();
    for post in posts {
        for tag in &post.header_tokens {
            let entry = ranking_entry(&mut headers, &mut indices, tag);
            entry.count += 1;
            increment(&mut entry.categories, &post.category);
        }
        let date = if truthy(&post.publish_at) {
            &post.publish_at
        } else {
            &post.created_at
        };
        if truthy(date) {
            let stamp = crate::post_routes::js_string(date);
            let bytes = stamp.as_bytes();
            if bytes.len() >= 7
                && bytes[0..4].iter().all(u8::is_ascii_digit)
                && bytes[4] == b'-'
                && bytes[5..7].iter().all(u8::is_ascii_digit)
            {
                increment(&mut months, &stamp[..7]);
            }
        }
    }
    headers.sort_by_key(|r| std::cmp::Reverse(r.count));
    let gaps: Vec<String> = headers
        .iter()
        .filter(|r| r.count <= 4)
        .map(|r| r.tag.clone())
        .collect();
    let by_header: Vec<Value> = headers
        .iter_mut()
        .map(|r| {
            r.categories.sort_by_key(|(_, n)| std::cmp::Reverse(*n));
            let categories: Vec<Value> = r
                .categories
                .iter()
                .map(|(name, n)| json!({"category":name,"n":n}))
                .collect();
            json!({"tag":r.tag,"posts":r.count,"categories":categories})
        })
        .collect();
    months.sort_by(|a, b| a.0.cmp(&b.0));
    let monthly: Vec<Value> = months
        .iter()
        .map(|(month, count)| json!({"month":month,"count":count}))
        .collect();
    json!({"by_header":by_header,"monthly":monthly,"empty_or_thin_header_count":gaps.len(),"gaps":gaps})
}

fn build_suggestions(
    metas: &[Ranking],
    headers: &[Ranking],
    pairs: &[(String, String, usize)],
    total: usize,
) -> Value {
    let mut clusters = Vec::new();
    let mut suggestions = Vec::new();
    for hub in metas.iter().take(5) {
        let mut spokes: Vec<(&str, usize)> = pairs
            .iter()
            .filter_map(|(a, b, count)| {
                if a == &hub.tag {
                    Some((b.as_str(), *count))
                } else if b == &hub.tag {
                    Some((a.as_str(), *count))
                } else {
                    None
                }
            })
            .collect();
        spokes.sort_by_key(|(_, count)| std::cmp::Reverse(*count));
        spokes.truncate(10);
        for (spoke, count) in spokes.iter().take(3) {
            if suggestions.len() >= 10 {
                break;
            }
            let mut hint = vec![hub.tag.as_str()];
            if *spoke != hub.tag {
                hint.push(spoke);
            }
            hint.extend(spokes.iter().take(3).map(|(tag, _)| *tag));
            hint.truncate(6);
            suggestions.push(json!({
                "title_hint":format!("{} × {} 교차 특집 (제안)",hub.tag,spoke),"header_hint":"소식","meta_hint":hint,
                "rationale":format!("허브 \"{}\"({}건)과 \"{}\"({}건 공출현)는 자주 연결되나 특집 포맷의 교차 분석 기사가 부족할 수 있다.",hub.tag,hub.count,spoke,count),
                "priority":if hub.count>=15 {"상"} else if hub.count>=8 {"중"} else {"하"},"human_review":true
            }));
        }
        let spokes: Vec<Value> = spokes
            .iter()
            .map(|(tag, count)| json!({"tag":tag,"count":count}))
            .collect();
        clusters.push(json!({"hub":hub.tag,"hub_count":hub.count,"spokes":spokes}));
    }
    let thin:Vec<Value> = headers.iter().filter(|r|r.count>0 && r.count<=5).map(|r|json!({"tag":r.tag,"count":r.count,"pct":if total==0 {0.0} else {r.count as f64/total as f64}})).collect();
    json!({"hub_clusters":clusters,"thin_headers":thin,"suggestions":suggestions,"human_review_required":true})
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(v) => *v,
        Value::String(v) => !v.is_empty(),
        Value::Number(v) => v.as_f64().unwrap_or(0.0) != 0.0,
        _ => true,
    }
}
