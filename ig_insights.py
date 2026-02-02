#!/usr/bin/env python3
"""
Instagram 게시물 인사이트 자동 수집 → Google Sheets 기록
매일 실행하면 모든 게시물의 최신 데이터로 업데이트됨
+ 팔로워 일별 추적 시트 포함
"""

import requests
import gspread
from google.oauth2.service_account import Credentials
from datetime import datetime
import time
import sys
import os
import re

# 같은 폴더의 config 불러오기
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import (
    INSTAGRAM_BUSINESS_ACCOUNT_ID,
    GRAPH_API_VERSION,
    ACCESS_TOKEN,
    GOOGLE_CREDENTIALS_FILE,
    SPREADSHEET_ID,
    APP_ID,
    APP_SECRET,
)

BASE_URL = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

# 한국어 요일
WEEKDAYS_KO = ["월", "화", "수", "목", "금", "토", "일"]


# ─── 토큰 자동 갱신 ──────────────────────────────────────────

def refresh_token_if_needed():
    """토큰 만료 전 자동 갱신 (매 실행 시 체크)"""
    global ACCESS_TOKEN

    if APP_SECRET == "여기에_앱시크릿_붙여넣기":
        print("  ⚠️ 앱 시크릿 미설정 → 토큰 자동 갱신 건너뜀")
        return ACCESS_TOKEN

    # 현재 토큰 유효성 및 만료일 확인
    debug_url = f"{BASE_URL}/debug_token?input_token={ACCESS_TOKEN}&access_token={APP_ID}|{APP_SECRET}"
    try:
        resp = requests.get(debug_url).json()
        data = resp.get("data", {})
        expires_at = data.get("expires_at", 0)

        if expires_at == 0:
            print("  ⚠️ 토큰 만료일 확인 불가 → 갱신 시도")
        else:
            from datetime import timezone
            now_ts = int(datetime.now(timezone.utc).timestamp())
            days_left = (expires_at - now_ts) / 86400
            print(f"  토큰 만료까지: {days_left:.0f}일 남음")

            if days_left > 7:
                return ACCESS_TOKEN  # 7일 이상 남으면 갱신 안 함
    except Exception as e:
        print(f"  ⚠️ 토큰 확인 실패: {e}")

    # 새 장기 토큰 발급
    print("  🔄 토큰 갱신 중...")
    refresh_url = (
        f"{BASE_URL}/oauth/access_token"
        f"?grant_type=fb_exchange_token"
        f"&client_id={APP_ID}"
        f"&client_secret={APP_SECRET}"
        f"&fb_exchange_token={ACCESS_TOKEN}"
    )
    try:
        resp = requests.get(refresh_url).json()
        new_token = resp.get("access_token")
        if new_token:
            # GitHub Actions: gh CLI로 Secret 업데이트
            if os.environ.get("GITHUB_ACTIONS"):
                repo = os.environ.get("GITHUB_REPOSITORY", "")
                if repo:
                    import subprocess
                    result = subprocess.run(
                        ["gh", "secret", "set", "ACCESS_TOKEN", "--body", new_token, "--repo", repo],
                        capture_output=True, text=True
                    )
                    if result.returncode == 0:
                        print("  ✅ 토큰 갱신 완료! (GitHub Secret 업데이트됨)")
                    else:
                        print(f"  ⚠️ 토큰 갱신됨, GitHub Secret 업데이트 실패: {result.stderr}")
            else:
                # 로컬: config.py 파일에 새 토큰 저장
                config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.py")
                with open(config_path, "r", encoding="utf-8") as f:
                    content = f.read()
                content = content.replace(ACCESS_TOKEN, new_token)
                with open(config_path, "w", encoding="utf-8") as f:
                    f.write(content)
                print("  ✅ 토큰 갱신 완료! (새로운 60일 토큰 저장됨)")
            ACCESS_TOKEN = new_token
        else:
            error = resp.get("error", {}).get("message", "알 수 없는 오류")
            print(f"  ❌ 토큰 갱신 실패: {error}")
    except Exception as e:
        print(f"  ❌ 토큰 갱신 오류: {e}")

    return ACCESS_TOKEN


# ─── Instagram API ───────────────────────────────────────────

def get_all_media(limit=500):
    """최근 게시물 목록 가져오기 (페이징 지원)"""
    url = f"{BASE_URL}/{INSTAGRAM_BUSINESS_ACCOUNT_ID}/media"
    params = {
        "fields": "id,caption,media_type,permalink,timestamp,like_count,comments_count",
        "limit": min(limit, 100),
        "access_token": ACCESS_TOKEN,
    }
    all_media = []
    while url and len(all_media) < limit:
        resp = requests.get(url, params=params).json()
        if "error" in resp:
            print(f"[오류] 미디어 목록: {resp['error']['message']}")
            break
        all_media.extend(resp.get("data", []))
        url = resp.get("paging", {}).get("next")
        params = {}
    return all_media[:limit]


def get_media_insights(media_id, media_type):
    """개별 게시물 인사이트 가져오기"""
    if media_type == "STORY":
        metrics = "reach,views,shares,total_interactions,replies,taps_forward,taps_back,exits"
    elif media_type == "VIDEO":
        # 릴스는 profile_visits, follows, profile_activity 미지원
        metrics = "reach,views,saved,shares,total_interactions,likes,comments"
    else:
        # CAROUSEL_ALBUM, IMAGE 등은 프로필 메트릭 지원
        metrics = "reach,views,saved,shares,total_interactions,likes,comments,profile_visits,follows,profile_activity"

    url = f"{BASE_URL}/{media_id}/insights"
    params = {
        "metric": metrics,
        "access_token": ACCESS_TOKEN,
    }
    resp = requests.get(url, params=params).json()
    if "error" in resp:
        # 프로필 메트릭 오류 시 기본 메트릭으로 재시도
        if "profile_visits" in metrics:
            fallback = "reach,views,saved,shares,total_interactions,likes,comments"
            params["metric"] = fallback
            resp = requests.get(url, params=params).json()
            if "error" in resp:
                print(f"  [주의] 인사이트 오류 ({media_id}): {resp['error']['message']}")
                return {}
        else:
            print(f"  [주의] 인사이트 오류 ({media_id}): {resp['error']['message']}")
            return {}

    result = {}
    for item in resp.get("data", []):
        name = item["name"]
        value = item["values"][0]["value"]
        result[name] = value
    return result


def get_account_info():
    """계정 팔로워 수 가져오기"""
    url = f"{BASE_URL}/{INSTAGRAM_BUSINESS_ACCOUNT_ID}"
    params = {
        "fields": "followers_count,follows_count,media_count,username",
        "access_token": ACCESS_TOKEN,
    }
    resp = requests.get(url, params=params).json()
    if "error" in resp:
        print(f"[오류] 계정 정보: {resp['error']['message']}")
        return {}
    return resp


# ─── 카테고리 자동 분류 ────────────────────────────────────

CATEGORY_KEYWORDS = {
    "맛집": ["맛집", "레스토랑", "카페", "라멘", "스시", "이자카야", "오마카세", "디저트", "빵", "음식", "먹방", "맛", "식당", "우동", "돈부리", "야키토리", "소바", "규카츠", "텐동", "타코야키", "카레", "파스타", "브런치", "베이커리", "스위츠", "맛있"],
    "여행지": ["여행지", "관광", "명소", "포토스팟", "신사", "공원", "전망대", "거리", "야경", "벚꽃", "단풍", "성", "절", "해변", "온천마을", "산책", "풍경", "뷰", "일출", "일몰", "투어", "코스"],
    "현지정보": ["교통", "환율", "유심", "날씨", "입국", "택스프리", "편의점", "약국", "마트", "쇼핑", "IC카드", "스이카", "파스모", "공항", "전철", "지하철", "버스", "택시"],
    "여행팁": ["꿀팁", "가이드", "방법", "주의", "절약", "필수", "준비물", "팁", "꿀정보", "노하우", "주의사항", "알아야", "몰랐던", "실수"],
    "숙소": ["호텔", "료칸", "숙소", "게스트하우스", "에어비앤비", "리조트", "호스텔", "민박"],
    "로컬": ["현지", "에티켓", "메뉴", "문화", "일본어", "매너", "예절", "로컬", "현지인", "일본문화", "생활"],
    "할인정보": ["할인", "쿠폰", "세일", "무료", "특가", "프로모션", "혜택", "면세", "세금"],
}


def classify_category(caption):
    """캡션 전체를 분석하여 카테고리 자동 분류"""
    if not caption:
        return "기타"
    text = caption.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword.lower() in text:
                return category
    return "기타"


def format_date_ko(timestamp_str):
    """ISO 타임스탬프 → 한국어 날짜 (예: 26.01.24(토))"""
    if not timestamp_str:
        return ""
    try:
        dt = datetime.strptime(timestamp_str, "%Y-%m-%dT%H:%M:%S%z")
    except ValueError:
        try:
            dt = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except ValueError:
            return timestamp_str[:10]
    weekday = WEEKDAYS_KO[dt.weekday()]
    return f"{dt.strftime('%y.%m.%d')}({weekday})"


def now_date_ko():
    """현재 한국어 날짜"""
    now = datetime.now()
    return f"{now.strftime('%y.%m.%d')}({WEEKDAYS_KO[now.weekday()]})"


def collect_all_insights(limit=500):
    """모든 게시물의 인사이트 수집"""
    print("Instagram 게시물 목록 가져오는 중...")
    media_list = get_all_media(limit)
    print(f"  총 {len(media_list)}개 게시물 발견")

    account = get_account_info()
    followers = account.get("followers_count", 0)
    following = account.get("follows_count", 0)
    username = account.get("username", "")
    print(f"  현재 팔로워: {followers:,}명 | 팔로잉: {following:,}명")

    check_date = now_date_ko()

    results = []
    for i, media in enumerate(media_list):
        media_id = media["id"]
        media_type = media.get("media_type", "")
        print(f"  [{i+1}/{len(media_list)}] 인사이트 수집: {media_type} - {media_id}")

        insights = get_media_insights(media_id, media_type)
        time.sleep(0.3)

        # 캡션에서 제목 추출 (한글/영문 텍스트가 포함된 첫 줄, 최대 80자)
        caption = media.get("caption", "") or ""
        if caption:
            lines = [l.strip() for l in caption.split("\n") if l.strip()]
            title = ""
            for line in lines:
                # 한글, 영문, 숫자가 포함된 줄 찾기 (이모지만 있는 줄 건너뛰기)
                text_only = re.sub(r'[^\w\s가-힣a-zA-Z0-9]', '', line).strip()
                if text_only and len(text_only) >= 2:
                    title = line[:80]
                    break
            # 텍스트 줄을 못 찾으면 첫 줄 사용
            if not title and lines:
                title = lines[0][:80]
        else:
            title = "(캡션 없음)"

        # 지표
        reach = insights.get("reach", 0)
        views = insights.get("views", 0)
        likes = insights.get("likes", media.get("like_count", 0))
        saves = insights.get("saved", 0)
        shares = insights.get("shares", 0)
        comments = insights.get("comments", media.get("comments_count", 0))
        total_interactions = insights.get("total_interactions", 0)
        # VIDEO/REEL은 API에서 프로필 메트릭 미지원 → 빈칸 처리
        if media_type == "VIDEO":
            profile_visits = ""
            profile_activity = ""
            follows = ""
        else:
            profile_visits = insights.get("profile_visits", 0)
            profile_activity = insights.get("profile_activity", 0)
            follows = insights.get("follows", 0)

        # 계산 지표
        engagement_count = likes + saves + comments + shares
        engagement_rate = round(engagement_count / reach * 100, 1) if reach > 0 else 0
        save_rate = round(saves / reach * 100, 1) if reach > 0 else 0
        share_rate = round(shares / reach * 100, 1) if reach > 0 else 0
        follower_conversion = round(reach / followers * 100, 1) if followers > 0 else 0

        # 링크에 하이퍼링크 수식 적용
        # 릴스(VIDEO)는 /username/reel/코드/ 형식으로 변환 (탐색피드 리다이렉트 방지)
        permalink = media.get("permalink", "")
        if media_type == "VIDEO" and username:
            # /p/코드/ 또는 /reel/코드/ → /username/reel/코드/ 로 변환
            m_sc = re.search(r'/(?:p|reel)/([A-Za-z0-9_-]+)', permalink)
            if m_sc:
                shortcode = m_sc.group(1)
                permalink = f"https://www.instagram.com/{username}/reel/{shortcode}/"
        hyperlink = f'=HYPERLINK("{permalink}","보기")' if permalink else ""

        # 종합점수: 공유(30%) + 저장(25%) + 도달(25%) + 참여율(20%) 정규화 점수
        # 팔로워 성장 최적화 가중치 (바이럴·알고리즘 추천 중심)
        # (순위는 write_to_sheet에서 전체 데이터 기준으로 계산)
        composite_raw = {
            "shares": shares,
            "saves": saves,
            "reach": reach,
            "engagement_rate": engagement_rate,
        }

        # 캡션 전체로 카테고리 자동 분류
        category = classify_category(caption)

        results.append([
            format_date_ko(media.get("timestamp", "")),  # A: 업로드 일자
            check_date,                                     # B: 체크 일자
            media_type,                                     # C: 콘텐츠 유형
            "",                                             # D: 순위 (나중에 계산)
            category,                                       # E: 카테고리 (자동분류)
            title,                                          # F: 콘텐츠 제목
            hyperlink,                                      # G: 링크 (하이퍼링크)
            reach,                                          # H: 도달
            views,                                          # I: 노출(Views)
            likes,                                          # J: 좋아요
            saves,                                          # K: 저장
            shares,                                         # L: 공유
            comments,                                       # M: 댓글
            total_interactions,                             # N: 총 상호작용
            engagement_count,                               # O: 참여수
            f"{engagement_rate}%",                          # P: 참여율(%)
            f"{save_rate}%",                                # Q: 저장율(%)
            f"{share_rate}%",                               # R: 공유율(%)
            f"{follower_conversion}%",                      # S: 팔로워 대비 도달율(%)
            profile_visits,                                 # T: 프로필 방문 (API)
            profile_activity,                               # U: 외부링크 누름 (API)
            follows,                                        # V: 팔로우 (API)
            followers,                                      # W: 팔로워 수
            composite_raw,                                  # X: 종합점수 (나중에 계산)
        ])

    return results, followers, following


# ─── Google Sheets ───────────────────────────────────────────

HEADERS = [
    "업로드 일자",       # A
    "체크 일자",         # B
    "콘텐츠 유형",       # C
    "순위",             # D
    "카테고리",          # E  ← NEW
    "콘텐츠 제목",       # F
    "링크",             # G
    "도달",             # H
    "노출(Views)",      # I
    "좋아요",           # J
    "저장",             # K
    "공유",             # L
    "댓글",             # M
    "총 상호작용",       # N
    "참여수(좋+저+댓+공)", # O
    "참여율(%)",         # P
    "저장율(%)",         # Q
    "공유율(%)",         # R
    "팔로워 대비 도달율(%)", # S
    "프로필 방문",         # T
    "프로필 활동",         # U
    "팔로우",             # V
    "팔로워 수",         # W
    "종합점수",          # X
]


def get_sheet():
    """Google Sheets 연결"""
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    # GitHub Actions: 환경변수 GOOGLE_CREDENTIALS_JSON에서 직접 로드
    # 로컬: google_credentials.json 파일에서 로드
    google_creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if google_creds_json:
        import json
        info = json.loads(google_creds_json)
        creds = Credentials.from_service_account_info(info, scopes=scopes)
    else:
        creds_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), GOOGLE_CREDENTIALS_FILE)
        creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(creds)
    spreadsheet = client.open_by_key(SPREADSHEET_ID)
    return spreadsheet


def write_to_sheet(results):
    """Google Sheets '자동수집' 시트에 전체 데이터 덮어쓰기"""
    print("\nGoogle Sheets 연결 중...")
    spreadsheet = get_sheet()

    sheet_name = "자동수집"
    try:
        worksheet = spreadsheet.worksheet(sheet_name)
    except gspread.exceptions.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=30)

    # 수기 입력 데이터 보존 (카테고리 + 제목)
    # 매칭 키: permalink URL (HYPERLINK 수식에서 추출) — 표시값("보기")이 아닌 실제 URL로 매칭
    # T/U/V열(프로필방문, 프로필활동, 팔로우)은 API에서 자동 수집하므로 보존 불필요
    existing = worksheet.get_all_values()
    # G열을 FORMULA로 읽어서 실제 permalink URL 추출
    existing_formulas = worksheet.get('G1:G500', value_render_option='FORMULA')
    manual_data = {}  # permalink URL -> {category, title}
    if len(existing) > 1:
        header = existing[0]
        title_idx = header.index("콘텐츠 제목") if "콘텐츠 제목" in header else 5
        cat_idx = header.index("카테고리") if "카테고리" in header else 4
        for i, row in enumerate(existing[1:], start=1):
            # FORMULA에서 permalink URL 추출
            formula = existing_formulas[i][0] if i < len(existing_formulas) and existing_formulas[i] else ""
            m = re.search(r'instagram\.com/(?:p|reel|[^/]+/reel)/([A-Za-z0-9_-]+)', formula)
            if m:
                shortcode = m.group(1)
                title_val = row[title_idx] if len(row) > title_idx else ""
                cat_val = row[cat_idx] if len(row) > cat_idx else ""
                manual_data[shortcode] = {
                    "category": cat_val,
                    "title": title_val,
                }

    # 수기 입력 데이터 복원 (shortcode 기준 매칭 — 제목/카테고리 수정해도 안전)
    for row in results:
        link_formula = row[6]  # G열 = HYPERLINK 수식
        m = re.search(r'instagram\.com/(?:p|reel|[^/]+/reel)/([A-Za-z0-9_-]+)', link_formula)
        if m:
            shortcode = m.group(1)
            if shortcode in manual_data:
                md = manual_data[shortcode]
                if md["category"]:
                    row[4] = md["category"]  # 수정된 카테고리 유지
                if md["title"]:
                    row[5] = md["title"]     # 수정된 제목 유지

    # ─── 종합점수 계산 (정규화 후 가중합) ─────────────
    # 팔로워 성장 최적화: 공유(30%) + 저장(25%) + 도달(25%) + 참여율(20%)
    # X열(index 23) = 종합점수
    raw_scores = [r[23] for r in results if isinstance(r[23], dict)]
    if raw_scores:
        max_shares = max(s["shares"] for s in raw_scores) or 1
        max_saves = max(s["saves"] for s in raw_scores) or 1
        max_reach = max(s["reach"] for s in raw_scores) or 1
        max_eng_rate = max(s["engagement_rate"] for s in raw_scores) or 1

        for row in results:
            if isinstance(row[23], dict):
                s = row[23]
                score = (
                    (s["shares"] / max_shares) * 30 +
                    (s["saves"] / max_saves) * 25 +
                    (s["reach"] / max_reach) * 25 +
                    (s["engagement_rate"] / max_eng_rate) * 20
                )
                row[23] = round(score, 1)
            else:
                row[23] = 0

        # 순위 계산 (종합점수 높은 순) → D열(index 3)에 입력
        scored = [(i, r[23]) for i, r in enumerate(results)]
        scored.sort(key=lambda x: x[1], reverse=True)
        for rank, (idx, _) in enumerate(scored, 1):
            results[idx][3] = rank

    # 전체 시트 초기화 후 새로 쓰기
    worksheet.clear()

    all_data = [HEADERS] + results
    worksheet.update(range_name="A1", values=all_data, value_input_option="USER_ENTERED")

    # TOTAL, 평균 행 추가
    data_count = len(results)
    if data_count > 0:
        total_row_num = data_count + 2
        last_data_row = data_count + 1

        # TOTAL 행 (A~D 빈칸, E 빈칸, F "TOTAL", G 빈칸)
        # 열: D=순위, E=카테고리, F=제목, G=링크, H=도달... T=프로필방문, U=프로필활동, V=팔로우, W=팔로워, X=종합점수
        total_row = ["", "", "", "", "", "TOTAL", ""]
        for col_idx in range(7, 24):  # H ~ X
            col_letter = chr(ord("A") + col_idx) if col_idx < 26 else ""
            if col_idx in [19, 20, 21]:  # T, U, V (프로필방문, 프로필활동, 팔로우 합계)
                total_row.append(f"=SUM({col_letter}2:{col_letter}{last_data_row})")
            elif col_idx == 23:  # X(종합점수): 빈칸
                total_row.append("")
            elif col_idx <= 14 or col_idx == 22:  # 도달~참여수, 팔로워수: SUM
                total_row.append(f"=SUM({col_letter}2:{col_letter}{last_data_row})")
            else:  # 비율: 평균
                total_row.append(f"=AVERAGE({col_letter}2:{col_letter}{last_data_row})")

        # 평균 행
        avg_row = ["", "", "", "", "", "평균", ""]
        for col_idx in range(7, 24):  # H ~ X
            col_letter = chr(ord("A") + col_idx) if col_idx < 26 else ""
            avg_row.append(f"=AVERAGE({col_letter}2:{col_letter}{last_data_row})")

        worksheet.update(range_name=f"A{total_row_num}", values=[total_row, avg_row], value_input_option="USER_ENTERED")

    print(f"✅ {data_count}개 게시물 데이터를 '{sheet_name}' 시트에 기록했습니다.")


def write_follower_tracking(spreadsheet, followers, following):
    """'팔로워 추적' 시트에 일별 팔로워 수 기록 (누적)"""
    sheet_name = "팔로워추적"
    try:
        worksheet = spreadsheet.worksheet(sheet_name)
    except gspread.exceptions.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=6)
        worksheet.update(range_name="A1", values=[["날짜", "팔로워", "팔로잉", "일일 변화", "누적 변화", "메모"]])

    # 기존 데이터 확인
    existing = worksheet.get_all_values()
    today = now_date_ko()

    # 오늘 이미 기록되었으면 업데이트, 아니면 추가
    today_row_idx = None
    for i, row in enumerate(existing):
        if len(row) > 0 and row[0] == today:
            today_row_idx = i + 1  # 1-indexed
            break

    if today_row_idx:
        # 오늘 데이터 업데이트
        worksheet.update(range_name=f"B{today_row_idx}", values=[[followers, following]])
        print(f"  팔로워 추적: 오늘 데이터 업데이트 ({followers:,}명)")
    else:
        # 새 행 추가
        new_row_num = len(existing) + 1

        # 전날 팔로워 수로 일일 변화 계산
        if len(existing) > 1:
            daily_change_formula = f"=B{new_row_num}-B{new_row_num - 1}"
            cumul_change_formula = f"=B{new_row_num}-B2"
        else:
            daily_change_formula = 0
            cumul_change_formula = 0

        new_row = [today, followers, following, daily_change_formula, cumul_change_formula, ""]
        worksheet.update(range_name=f"A{new_row_num}", values=[new_row])
        print(f"  팔로워 추적: 새 기록 추가 ({followers:,}명)")


def write_daily_report(spreadsheet, results, followers, following):
    """'일별종합리포트' 시트에 매일 전체 수치 요약 기록"""
    sheet_name = "일별종합리포트"
    try:
        worksheet = spreadsheet.worksheet(sheet_name)
    except gspread.exceptions.WorksheetNotFound:
        worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=1000, cols=16)
        headers = [
            "날짜", "팔로워", "팔로워 변화", "팔로잉",
            "게시물 수", "총 도달", "총 노출", "총 좋아요",
            "총 저장", "총 공유", "총 댓글", "총 참여수",
            "평균 참여율", "평균 저장율", "평균 공유율", "메모"
        ]
        worksheet.update(range_name="A1", values=[headers], value_input_option="USER_ENTERED")

    existing = worksheet.get_all_values()
    today = now_date_ko()

    # 수치 계산 (열 순서: H=도달(7), I=노출(8), J=좋아요(9), K=저장(10), L=공유(11), M=댓글(12), O=참여수(14))
    post_count = len(results)
    total_reach = sum(r[7] for r in results if isinstance(r[7], (int, float)))
    total_views = sum(r[8] for r in results if isinstance(r[8], (int, float)))
    total_likes = sum(r[9] for r in results if isinstance(r[9], (int, float)))
    total_saves = sum(r[10] for r in results if isinstance(r[10], (int, float)))
    total_shares = sum(r[11] for r in results if isinstance(r[11], (int, float)))
    total_comments = sum(r[12] for r in results if isinstance(r[12], (int, float)))
    total_engagement = total_likes + total_saves + total_shares + total_comments

    # 참여율 계산 (% 값에서 숫자 추출) - P=참여율(15), Q=저장율(16), R=공유율(17)
    def parse_pct(val):
        if isinstance(val, str) and val.endswith("%"):
            try:
                return float(val[:-1])
            except ValueError:
                return 0
        return float(val) if isinstance(val, (int, float)) else 0

    eng_rates = [parse_pct(r[15]) for r in results]
    save_rates = [parse_pct(r[16]) for r in results]
    share_rates = [parse_pct(r[17]) for r in results]

    avg_eng = round(sum(eng_rates) / len(eng_rates), 1) if eng_rates else 0
    avg_save = round(sum(save_rates) / len(save_rates), 1) if save_rates else 0
    avg_share = round(sum(share_rates) / len(share_rates), 1) if share_rates else 0

    # 오늘 이미 기록됐는지 확인
    today_row_idx = None
    for i, row in enumerate(existing):
        if len(row) > 0 and row[0] == today:
            today_row_idx = i + 1
            break

    new_row_num = today_row_idx if today_row_idx else len(existing) + 1

    # 팔로워 변화 계산
    if new_row_num > 2 and not today_row_idx:
        follower_change_formula = f"=B{new_row_num}-B{new_row_num - 1}"
    elif today_row_idx and today_row_idx > 2:
        follower_change_formula = f"=B{today_row_idx}-B{today_row_idx - 1}"
    else:
        follower_change_formula = 0

    new_row = [
        today, followers, follower_change_formula, following,
        post_count, total_reach, total_views, total_likes,
        total_saves, total_shares, total_comments, total_engagement,
        f"{avg_eng}%", f"{avg_save}%", f"{avg_share}%", ""
    ]

    worksheet.update(range_name=f"A{new_row_num}", values=[new_row], value_input_option="USER_ENTERED")
    action = "업데이트" if today_row_idx else "추가"
    print(f"  일별종합리포트: 오늘 데이터 {action} 완료")


# ─── 실행 ────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print("  Instagram 인사이트 자동 수집기")
    print(f"  실행 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 50)

    if ACCESS_TOKEN == "여기에_장기토큰_붙여넣기":
        print("\n[오류] config.py에서 ACCESS_TOKEN을 설정해 주세요.")
        sys.exit(1)

    # 토큰 자동 갱신 체크
    refresh_token_if_needed()

    results, followers, following = collect_all_insights(limit=500)

    if results:
        write_to_sheet(results)

        # 팔로워 추적 + 일별종합리포트 시트에도 기록
        spreadsheet = get_sheet()
        write_follower_tracking(spreadsheet, followers, following)
        write_daily_report(spreadsheet, results, followers, following)

        print(f"\n{'='*50}")
        print(f"  수집 완료! 총 {len(results)}개 게시물")
        print(f"  팔로워: {followers:,}명 | 팔로잉: {following:,}명")
        print(f"{'='*50}")
    else:
        print("\n수집된 데이터가 없습니다.")


if __name__ == "__main__":
    main()
