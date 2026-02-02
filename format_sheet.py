#!/usr/bin/env python3
"""
Google Sheets 서식 꾸미기 - 색상, 굵기, 열 너비, 테두리 등
"""

import gspread
from google.oauth2.service_account import Credentials
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import GOOGLE_CREDENTIALS_FILE, SPREADSHEET_ID


def get_sheet():
    creds_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), GOOGLE_CREDENTIALS_FILE)
    scopes = [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive",
    ]
    creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
    client = gspread.authorize(creds)
    return client.open_by_key(SPREADSHEET_ID)


def format_auto_sheet():
    """자동수집 시트 서식 적용"""
    spreadsheet = get_sheet()
    worksheet = spreadsheet.worksheet("자동수집")

    sheet_id = worksheet.id
    data = worksheet.get_all_values()
    data_count = len(data) - 1  # 헤더 제외
    last_row = len(data)
    total_row = last_row - 1  # TOTAL 행
    avg_row = last_row         # 평균 행

    requests_list = []

    # ─── 1. 열 너비 설정 ─────────────────────────────
    col_widths = {
        0: 110,   # A: 업로드 일자
        1: 100,   # B: 체크 일자
        2: 130,   # C: 콘텐츠 유형
        3: 50,    # D: 순위
        4: 100,   # E: 카테고리 ← NEW
        5: 250,   # F: 콘텐츠 제목
        6: 80,    # G: 링크
        7: 80,    # H: 도달
        8: 80,    # I: 노출
        9: 70,    # J: 좋아요
        10: 70,   # K: 저장
        11: 70,   # L: 공유
        12: 70,   # M: 댓글
        13: 90,   # N: 총 상호작용
        14: 100,  # O: 참여수
        15: 80,   # P: 참여율
        16: 80,   # Q: 저장율
        17: 80,   # R: 공유율
        18: 110,  # S: 팔로워 대비 도달율
        19: 100,  # T: 프로필 방문
        20: 110,  # U: 외부링크
        21: 80,   # V: 팔로우
        22: 90,   # W: 팔로워 수
        23: 80,   # X: 종합점수
    }
    for col, width in col_widths.items():
        requests_list.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": col,
                    "endIndex": col + 1,
                },
                "properties": {"pixelSize": width},
                "fields": "pixelSize",
            }
        })

    # ─── 2. 헤더 행 서식 (1행) ─────────────────────────
    # 헤더 배경색: 진한 네이비
    requests_list.append({
        "repeatCell": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": 0,
                "endRowIndex": 1,
                "startColumnIndex": 0,
                "endColumnIndex": 24,
            },
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 0.15, "green": 0.18, "blue": 0.28},
                    "textFormat": {
                        "foregroundColor": {"red": 1, "green": 1, "blue": 1},
                        "bold": True,
                        "fontSize": 10,
                    },
                    "horizontalAlignment": "CENTER",
                    "verticalAlignment": "MIDDLE",
                    "wrapStrategy": "WRAP",
                }
            },
            "fields": "userEnteredFormat",
        }
    })

    # 헤더 행 높이
    requests_list.append({
        "updateDimensionProperties": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "ROWS",
                "startIndex": 0,
                "endIndex": 1,
            },
            "properties": {"pixelSize": 45},
            "fields": "pixelSize",
        }
    })

    # ─── 3. Info 영역 (A~F열) 배경색: 연한 회색 ─────────
    if data_count > 0:
        # A~D열 (업로드일자, 체크일자, 유형, 순위): 가운데 정렬
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 0,
                    "endColumnIndex": 4,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.95, "green": 0.95, "blue": 0.97},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })
        # D열 (순위): 볼드 + 연한 빨강 배경
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 3,
                    "endColumnIndex": 4,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 1.0, "green": 0.9, "blue": 0.9},
                        "textFormat": {"fontSize": 10, "bold": True},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })
        # E열 (카테고리): 가운데 정렬 + 연한 회색
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 4,
                    "endColumnIndex": 5,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.95, "green": 0.95, "blue": 0.97},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })
        # F열 (콘텐츠 제목): 왼쪽 정렬
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 5,
                    "endColumnIndex": 6,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.95, "green": 0.95, "blue": 0.97},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "LEFT",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })
        # G열 (링크): 가운데 정렬
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 6,
                    "endColumnIndex": 7,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.95, "green": 0.95, "blue": 0.97},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 4. 도달/노출 영역 (H~I열) 배경색: 연한 파랑 ─────
    if data_count > 0:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 7,
                    "endColumnIndex": 9,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.87, "green": 0.92, "blue": 1.0},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 5. 반응(참여) 영역 (J~O열) 배경색: 연한 녹색 ─────
    if data_count > 0:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 9,
                    "endColumnIndex": 15,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.88, "green": 0.97, "blue": 0.88},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 6. 비율 영역 (P~S열) 배경색: 연한 노랑 ─────
    if data_count > 0:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 15,
                    "endColumnIndex": 19,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 1.0, "green": 0.98, "blue": 0.88},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                        "numberFormat": {"type": "NUMBER", "pattern": "0.00%"},
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 7. 수기입력 영역 (T~V열) 배경색: 연한 주황 ─────
    if data_count > 0:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 19,
                    "endColumnIndex": 22,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 1.0, "green": 0.93, "blue": 0.85},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 8. 팔로워 수 (W열) 배경색: 연한 보라 ─────
    if data_count > 0:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 22,
                    "endColumnIndex": 23,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.92, "green": 0.88, "blue": 1.0},
                        "textFormat": {"fontSize": 9},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 8-1. 종합점수 (X열) 배경색: 연한 빨강 ─────
    if data_count > 0:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 23,
                    "endColumnIndex": 24,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 1.0, "green": 0.9, "blue": 0.9},
                        "textFormat": {"fontSize": 9, "bold": True},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 9. TOTAL 행 서식 ─────────────────────────────
    if data_count > 0:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": total_row - 1,
                    "endRowIndex": total_row,
                    "startColumnIndex": 0,
                    "endColumnIndex": 24,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.2, "green": 0.25, "blue": 0.35},
                        "textFormat": {
                            "foregroundColor": {"red": 1, "green": 1, "blue": 1},
                            "bold": True,
                            "fontSize": 10,
                        },
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 10. 평균 행 서식 ─────────────────────────────
    if data_count > 0:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": avg_row - 1,
                    "endRowIndex": avg_row,
                    "startColumnIndex": 0,
                    "endColumnIndex": 24,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.95, "green": 0.85, "blue": 0.55},
                        "textFormat": {
                            "bold": True,
                            "fontSize": 10,
                        },
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

    # ─── 11. 전체 테두리 ─────────────────────────────
    requests_list.append({
        "updateBorders": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": 0,
                "endRowIndex": last_row,
                "startColumnIndex": 0,
                "endColumnIndex": 24,
            },
            "top": {"style": "SOLID", "color": {"red": 0.7, "green": 0.7, "blue": 0.7}},
            "bottom": {"style": "SOLID", "color": {"red": 0.7, "green": 0.7, "blue": 0.7}},
            "left": {"style": "SOLID", "color": {"red": 0.7, "green": 0.7, "blue": 0.7}},
            "right": {"style": "SOLID", "color": {"red": 0.7, "green": 0.7, "blue": 0.7}},
            "innerHorizontal": {"style": "SOLID", "color": {"red": 0.85, "green": 0.85, "blue": 0.85}},
            "innerVertical": {"style": "SOLID", "color": {"red": 0.85, "green": 0.85, "blue": 0.85}},
        }
    })

    # ─── 12. 1행 고정 ─────────────────────────────────
    requests_list.append({
        "updateSheetProperties": {
            "properties": {
                "sheetId": sheet_id,
                "gridProperties": {"frozenRowCount": 1},
            },
            "fields": "gridProperties.frozenRowCount",
        }
    })

    # ─── 13. 숫자 형식 (천 단위 콤마) ─────────────────
    if data_count > 0:
        # H~O열, T~W열: 숫자 콤마
        for col_range in [(7, 15), (19, 23)]:
            requests_list.append({
                "repeatCell": {
                    "range": {
                        "sheetId": sheet_id,
                        "startRowIndex": 1,
                        "endRowIndex": data_count + 1,
                        "startColumnIndex": col_range[0],
                        "endColumnIndex": col_range[1],
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "numberFormat": {"type": "NUMBER", "pattern": "#,##0"},
                        }
                    },
                    "fields": "userEnteredFormat.numberFormat",
                }
            })

        # P~S열: 퍼센트 텍스트 (이미 "1.5%" 형태로 입력됨) - 가운데 정렬만
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 15,
                    "endColumnIndex": 19,
                },
                "cell": {
                    "userEnteredFormat": {
                        "horizontalAlignment": "CENTER",
                    }
                },
                "fields": "userEnteredFormat.horizontalAlignment",
            }
        })

    # ─── 14. 카테고리 드롭다운 (E열) ─────────────────
    if data_count > 0:
        categories = ["맛집", "여행지", "현지정보", "여행팁", "숙소", "로컬", "할인정보", "기타"]
        requests_list.append({
            "setDataValidation": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": data_count + 1,
                    "startColumnIndex": 4,
                    "endColumnIndex": 5,
                },
                "rule": {
                    "condition": {
                        "type": "ONE_OF_LIST",
                        "values": [{"userEnteredValue": c} for c in categories],
                    },
                    "showCustomUi": True,
                    "strict": False,  # 사용자가 새 카테고리 직접 입력 가능
                },
            }
        })

    # 실행
    spreadsheet.batch_update({"requests": requests_list})
    print("✅ '자동수집' 시트 서식 적용 완료!")


def format_follower_sheet():
    """팔로워추적 시트 서식 적용"""
    spreadsheet = get_sheet()
    try:
        worksheet = spreadsheet.worksheet("팔로워추적")
    except gspread.exceptions.WorksheetNotFound:
        print("팔로워추적 시트가 없습니다.")
        return

    sheet_id = worksheet.id
    data = worksheet.get_all_values()

    requests_list = []

    # 헤더 서식
    requests_list.append({
        "repeatCell": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": 0,
                "endRowIndex": 1,
                "startColumnIndex": 0,
                "endColumnIndex": 6,
            },
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 0.15, "green": 0.18, "blue": 0.28},
                    "textFormat": {
                        "foregroundColor": {"red": 1, "green": 1, "blue": 1},
                        "bold": True,
                        "fontSize": 10,
                    },
                    "horizontalAlignment": "CENTER",
                    "verticalAlignment": "MIDDLE",
                }
            },
            "fields": "userEnteredFormat",
        }
    })

    # 열 너비
    widths = {0: 120, 1: 90, 2: 90, 3: 90, 4: 90, 5: 150}
    for col, w in widths.items():
        requests_list.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": col,
                    "endIndex": col + 1,
                },
                "properties": {"pixelSize": w},
                "fields": "pixelSize",
            }
        })

    # 데이터 영역 서식
    if len(data) > 1:
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": len(data),
                    "startColumnIndex": 0,
                    "endColumnIndex": 6,
                },
                "cell": {
                    "userEnteredFormat": {
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                        "textFormat": {"fontSize": 10},
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

        # 숫자 콤마
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": len(data),
                    "startColumnIndex": 1,
                    "endColumnIndex": 5,
                },
                "cell": {
                    "userEnteredFormat": {
                        "numberFormat": {"type": "NUMBER", "pattern": "#,##0"},
                    }
                },
                "fields": "userEnteredFormat.numberFormat",
            }
        })

    # 1행 고정
    requests_list.append({
        "updateSheetProperties": {
            "properties": {
                "sheetId": sheet_id,
                "gridProperties": {"frozenRowCount": 1},
            },
            "fields": "gridProperties.frozenRowCount",
        }
    })

    spreadsheet.batch_update({"requests": requests_list})
    print("✅ '팔로워추적' 시트 서식 적용 완료!")


def format_daily_report_sheet():
    """일별종합리포트 시트 서식 적용"""
    spreadsheet = get_sheet()
    try:
        worksheet = spreadsheet.worksheet("일별종합리포트")
    except gspread.exceptions.WorksheetNotFound:
        print("일별종합리포트 시트가 없습니다.")
        return

    sheet_id = worksheet.id
    data = worksheet.get_all_values()

    requests_list = []

    # 헤더 서식 (진한 네이비)
    requests_list.append({
        "repeatCell": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": 0,
                "endRowIndex": 1,
                "startColumnIndex": 0,
                "endColumnIndex": 16,
            },
            "cell": {
                "userEnteredFormat": {
                    "backgroundColor": {"red": 0.15, "green": 0.18, "blue": 0.28},
                    "textFormat": {
                        "foregroundColor": {"red": 1, "green": 1, "blue": 1},
                        "bold": True,
                        "fontSize": 10,
                    },
                    "horizontalAlignment": "CENTER",
                    "verticalAlignment": "MIDDLE",
                    "wrapStrategy": "WRAP",
                }
            },
            "fields": "userEnteredFormat",
        }
    })

    # 헤더 행 높이
    requests_list.append({
        "updateDimensionProperties": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "ROWS",
                "startIndex": 0,
                "endIndex": 1,
            },
            "properties": {"pixelSize": 40},
            "fields": "pixelSize",
        }
    })

    # 열 너비
    col_widths = {
        0: 120,   # 날짜
        1: 90,    # 팔로워
        2: 90,    # 팔로워 변화
        3: 90,    # 팔로잉
        4: 80,    # 게시물 수
        5: 90,    # 총 도달
        6: 90,    # 총 노출
        7: 80,    # 총 좋아요
        8: 80,    # 총 저장
        9: 80,    # 총 공유
        10: 80,   # 총 댓글
        11: 90,   # 총 참여수
        12: 90,   # 평균 참여율
        13: 90,   # 평균 저장율
        14: 90,   # 평균 공유율
        15: 150,  # 메모
    }
    for col, width in col_widths.items():
        requests_list.append({
            "updateDimensionProperties": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": col,
                    "endIndex": col + 1,
                },
                "properties": {"pixelSize": width},
                "fields": "pixelSize",
            }
        })

    # 데이터 영역 서식
    if len(data) > 1:
        # 팔로워 영역 (B~D열): 연한 보라
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": len(data),
                    "startColumnIndex": 1,
                    "endColumnIndex": 4,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.92, "green": 0.88, "blue": 1.0},
                        "textFormat": {"fontSize": 10},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

        # 수치 영역 (E~L열): 연한 파랑
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": len(data),
                    "startColumnIndex": 4,
                    "endColumnIndex": 12,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.87, "green": 0.92, "blue": 1.0},
                        "textFormat": {"fontSize": 10},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

        # 비율 영역 (M~O열): 연한 노랑
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": len(data),
                    "startColumnIndex": 12,
                    "endColumnIndex": 15,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 1.0, "green": 0.98, "blue": 0.88},
                        "textFormat": {"fontSize": 10},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

        # 날짜 열 (A열) + 메모 열 (P열): 기본 서식
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": len(data),
                    "startColumnIndex": 0,
                    "endColumnIndex": 1,
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {"red": 0.95, "green": 0.95, "blue": 0.97},
                        "textFormat": {"fontSize": 10},
                        "horizontalAlignment": "CENTER",
                        "verticalAlignment": "MIDDLE",
                    }
                },
                "fields": "userEnteredFormat",
            }
        })

        # 숫자 콤마 (B~L열)
        requests_list.append({
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 1,
                    "endRowIndex": len(data),
                    "startColumnIndex": 1,
                    "endColumnIndex": 12,
                },
                "cell": {
                    "userEnteredFormat": {
                        "numberFormat": {"type": "NUMBER", "pattern": "#,##0"},
                    }
                },
                "fields": "userEnteredFormat.numberFormat",
            }
        })

    # 테두리
    requests_list.append({
        "updateBorders": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": 0,
                "endRowIndex": len(data),
                "startColumnIndex": 0,
                "endColumnIndex": 16,
            },
            "top": {"style": "SOLID", "color": {"red": 0.7, "green": 0.7, "blue": 0.7}},
            "bottom": {"style": "SOLID", "color": {"red": 0.7, "green": 0.7, "blue": 0.7}},
            "left": {"style": "SOLID", "color": {"red": 0.7, "green": 0.7, "blue": 0.7}},
            "right": {"style": "SOLID", "color": {"red": 0.7, "green": 0.7, "blue": 0.7}},
            "innerHorizontal": {"style": "SOLID", "color": {"red": 0.85, "green": 0.85, "blue": 0.85}},
            "innerVertical": {"style": "SOLID", "color": {"red": 0.85, "green": 0.85, "blue": 0.85}},
        }
    })

    # 1행 고정
    requests_list.append({
        "updateSheetProperties": {
            "properties": {
                "sheetId": sheet_id,
                "gridProperties": {"frozenRowCount": 1},
            },
            "fields": "gridProperties.frozenRowCount",
        }
    })

    spreadsheet.batch_update({"requests": requests_list})
    print("✅ '일별종합리포트' 시트 서식 적용 완료!")


if __name__ == "__main__":
    print("Google Sheets 서식 적용 중...")
    format_auto_sheet()
    format_follower_sheet()
    format_daily_report_sheet()
    print("\n모든 서식 적용 완료!")
