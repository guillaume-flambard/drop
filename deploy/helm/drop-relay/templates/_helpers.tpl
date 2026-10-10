{{- define "drop-relay.name" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "drop-relay.labels" -}}
app.kubernetes.io/name: drop-relay
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end -}}

{{- define "drop-relay.selector" -}}
app.kubernetes.io/name: drop-relay
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "drop-relay.image" -}}
{{- if .Values.image.digest -}}
{{ .Values.image.repository }}@{{ .Values.image.digest }}
{{- else -}}
{{ .Values.image.repository }}:{{ .Values.image.tag }}
{{- end -}}
{{- end -}}

{{- define "drop-relay.config" -}}
{{- $config := deepCopy .Values.config -}}
{{- if .Values.policy.enabled -}}
{{- $_ := set $config "policyPath" "/policy/policy.json" -}}
{{- $_ := set $config "policyIssuer" (required "policy.issuer is required with a policy" .Values.policy.issuer) -}}
{{- end -}}
{{- if .Values.tls.enabled -}}
{{- $_ := set $config "port" 8443 -}}
{{- $_ := set $config "tls" (dict "certPath" "/tls/tls.crt" "keyPath" "/tls/tls.key") -}}
{{- end -}}
{{ toJson $config }}
{{- end -}}
