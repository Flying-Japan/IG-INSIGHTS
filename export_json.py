#!/usr/bin/env python3
"""
Google Sheets 데이터를 JSON 파일로 내보내기
GitHub Pages 대시보드에서 사용할 정적 데이터 생성
"""

import json
import os
import sys
import re
from datetime import datetime, timezone, timedelta

# 설정 불러오기
if os.environ.get("GITHUB_ACTIONS"):
    GOOGLE_CREDENTIALS_FILE = "google_credentials.json"
    SPREADSHEET_ID = os.environ.get("SPREADSHEET_ID", "")
else:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from config import GOOGLE_CREDENTIALS_FILE, SPREADSHEET_ID

import gspread
from google.oauth2.service_account import Credentials


def get_sheet():
    """Google Sheets 연결"""
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    google_creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if google_creds_json:
        info = json.loads(google_creds_json)
        creds = Credentials.from_service_account_info(info, scopes=scopes)
    else:
        creds_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), GOOGLE_CREDENTIALS_FILE)
        creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(creds)
    return client.open_by_key(SPREADSHEET_ID)


def parse_number(val):
    """문자열을 숫자로 변환 (콤마, 빈칸 처리)"""
    if val is None or val == "" or val == "-":
        return None
    if isinstance(val, (int, float)):
        return val
    val = str(val).replace(",", "").strip()
    try:
        return int(val)
    except ValueError:
        try:
            return float(val)
        except ValueError:
            return None


def parse_percent(val):
    """퍼센트 문자열 → float (예: '5.2%' → 5.2)"""
    if val is None or val == "" or val == "-":
        return None
    val = str(val).replace("%", "").strip()
    try:
        return float(val)
    except ValueError:
        return None


def extract_url_from_hyperlink(formula):
    """HYPERLINK 수식에서 URL 추출"""
    if not formula:
        return ""
    m = re.search(r'HYPERLINK\("([^"]+)"', formula)
    return m.group(1) if m else formula


def export_posts(spreadsheet):
    """자동수집 시트 → posts.json"""
    print("  자동수집 시트 읽는 중...")
    ws = spreadsheet.worksheet("자동수집")
    all_values = ws.get_all_values()

    # G열 HYPERLINK 수식에서 URL 추출
    formulas = ws.get("G1:G500", value_render_option="FORMULA")

    if len(all_values) < 2:
        return []

    posts = []
    for i, row in enumerate(all_values[1:], start=1):
        # TOTAL, 평균 행 건너뛰기
        if len(row) > 5 and row[5] in ("TOTAL", "평균"):
            break

        # URL 추출
        url = ""
        if i < len(formulas) and formulas[i]:
            url = extract_url_from_hyperlink(formulas[i][0] if formulas[i] else "")

        post = {
            "upload_date": row[0] if len(row) > 0 else "",
            "check_date": row[1] if len(row) > 1 else "",
            "media_type": row[2] if len(row) > 2 else "",
            "rank": parse_number(row[3]) if len(row) > 3 else None,
            "category": row[4] if len(row) > 4 else "",
            "title": row[5] if len(row) > 5 else "",
            "url": url,
            "reach": parse_number(row[7]) if len(row) > 7 else None,
            "views": parse_number(row[8]) if len(row) > 8 else None,
            "likes": parse_number(row[9]) if len(row) > 9 else None,
            "saves": parse_number(row[10]) if len(row) > 10 else None,
            "shares": parse_number(row[11]) if len(row) > 11 else None,
            "comments": parse_number(row[12]) if len(row) > 12 else None,
            "total_interactions": parse_number(row[13]) if len(row) > 13 else None,
            "engagement_count": parse_number(row[14]) if len(row) > 14 else None,
            "engagement_rate": parse_percent(row[15]) if len(row) > 15 else None,
            "save_rate": parse_percent(row[16]) if len(row) > 16 else None,
            "share_rate": parse_percent(row[17]) if len(row) > 17 else None,
            "follower_reach_rate": parse_percent(row[18]) if len(row) > 18 else None,
            "profile_visits": parse_number(row[19]) if len(row) > 19 else None,
            "profile_activity": parse_number(row[20]) if len(row) > 20 else None,
            "follows": parse_number(row[21]) if len(row) > 21 else None,
            "followers": parse_number(row[22]) if len(row) > 22 else None,
            "composite_score": parse_number(row[23]) if len(row) > 23 else None,
        }
        posts.append(post)

    return posts


def export_followers(spreadsheet):
    """팔로워추적 시트 → followers.json"""
    print("  팔로워추적 시트 읽는 중...")
    ws = spreadsheet.worksheet("팔로워추적")
    all_values = ws.get_all_values()

    if len(all_values) < 2:
        return []

    followers = []
    for row in all_values[1:]:
        if not row[0]:
            continue
        entry = {
            "date": row[0],
            "followers": parse_number(row[1]) if len(row) > 1 else None,
            "following": parse_number(row[2]) if len(row) > 2 else None,
            "daily_change": parse_number(row[3]) if len(row) > 3 else None,
            "cumulative_change": parse_number(row[4]) if len(row) > 4 else None,
        }
        followers.append(entry)

    return followers


def export_daily_report(spreadsheet):
    """일별종합리포트 시트 → daily_report.json"""
    print("  일별종합리포트 시트 읽는 중...")
    ws = spreadsheet.worksheet("일별종합리포트")
    all_values = ws.get_all_values()

    if len(all_values) < 2:
        return []

    reports = []
    for row in all_values[1:]:
        if not row[0]:
            continue
        report = {
            "date": row[0],
            "followers": parse_number(row[1]) if len(row) > 1 else None,
            "follower_change": parse_number(row[2]) if len(row) > 2 else None,
            "following": parse_number(row[3]) if len(row) > 3 else None,
            "post_count": parse_number(row[4]) if len(row) > 4 else None,
            "total_reach": parse_number(row[5]) if len(row) > 5 else None,
            "total_views": parse_number(row[6]) if len(row) > 6 else None,
            "total_likes": parse_number(row[7]) if len(row) > 7 else None,
            "total_saves": parse_number(row[8]) if len(row) > 8 else None,
            "total_shares": parse_number(row[9]) if len(row) > 9 else None,
            "total_comments": parse_number(row[10]) if len(row) > 10 else None,
            "total_engagement": parse_number(row[11]) if len(row) > 11 else None,
            "avg_engagement_rate": parse_percent(row[12]) if len(row) > 12 else None,
            "avg_save_rate": parse_percent(row[13]) if len(row) > 13 else None,
            "avg_share_rate": parse_percent(row[14]) if len(row) > 14 else None,
        }
        reports.append(report)

    return reports


def main():
    KST = timezone(timedelta(hours=9))
    now = datetime.now(KST)

    print("=" * 50)
    print("  Google Sheets → JSON 내보내기")
    print(f"  실행 시간: {now.strftime('%Y-%m-%d %H:%M:%S')} KST")
    print("=" * 50)

    spreadsheet = get_sheet()

    posts = export_posts(spreadsheet)
    followers = export_followers(spreadsheet)
    daily_report = export_daily_report(spreadsheet)

    # docs/data/ 디렉토리 생성
    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "data")
    os.makedirs(data_dir, exist_ok=True)

    # JSON 파일 저장
    def write_json(filename, data):
        path = os.path.join(data_dir, filename)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"  {filename}: {len(data) if isinstance(data, list) else 1}건 저장")

    write_json("posts.json", posts)
    write_json("followers.json", followers)
    write_json("daily_report.json", daily_report)
    write_json("meta.json", {
        "updated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "updated_at_ko": f"{now.strftime('%y.%m.%d')} {now.strftime('%H:%M')}",
        "post_count": len(posts),
        "follower_days": len(followers),
        "report_days": len(daily_report),
    })

    print(f"\n{'=' * 50}")
    print(f"  내보내기 완료!")
    print(f"  게시물: {len(posts)}건 | 팔로워추적: {len(followers)}일 | 리포트: {len(daily_report)}일")
    print(f"{'=' * 50}")


if __name__ == "__main__":
    main()
