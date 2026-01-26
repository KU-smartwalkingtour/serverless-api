
# 인증서 요청
resource "aws_acm_certificate" "api_smartwalkingtour_site" {
  domain_name       = "api.ku-smartwalkingtour.site"
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

// 호스팅 존 정보 조회
data "aws_route53_zone" "smartwalkingtour_site" {
  name         = "ku-smartwalkingtour.site"
  private_zone = false
}

resource "aws_route53_record" "api_smartwalkingtour_site_validation_record" {
  for_each = {
    for dvo in aws_acm_certificate.api_smartwalkingtour_site.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name  // ex: _9800eb....35af.api.serverless.ku-smartwalkingtour.site.
      record = dvo.resource_record_value // ex: _d5db6...15e6.jkd...zm.acm-validations.aws.
      type   = dvo.resource_record_type // ex: CNAME
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.smartwalkingtour_site.zone_id
}

resource "aws_acm_certificate_validation" "api_smartwalkingtour_site" {
  certificate_arn         = aws_acm_certificate.api_smartwalkingtour_site.arn
  validation_record_fqdns = [for r in aws_route53_record.api_smartwalkingtour_site_validation_record : r.fqdn]
}