package repo

import (
	"testing"
)

func TestNormalizeSftpArgs(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:    "simple sftp.args with -i flag",
			input:   `-o sftp.args=-oBatchMode=yes -i /path/to/key`,
			want:    `-o sftp.args=-oBatchMode=yes -i /path/to/key`,
			wantErr: false,
		},
		{
			name:    "sftp.args with quoted path",
			input:   `-o sftp.args=-oBatchMode=yes -i "/config/.backrest-ssh/id_ed25519_192.168.50.74"`,
			want:    `-o sftp.args=-oBatchMode=yes -i /config/.backrest-ssh/id_ed25519_192.168.50.74`,
			wantErr: false,
		},
		{
			name:    "sftp.args with multiple options",
			input:   `-o sftp.args=-oBatchMode=yes -i "/config/.backrest-ssh/id_ed25519_192.168.50.74" -oUserKnownHostsFile="/config/.backrest-ssh/known_hosts"`,
			want:    `-o sftp.args=-oBatchMode=yes -i /config/.backrest-ssh/id_ed25519_192.168.50.74 -oUserKnownHostsFile=/config/.backrest-ssh/known_hosts`,
			wantErr: false,
		},
		{
			name:    "non-sftp.args flag should be unchanged",
			input:   `-o other.args=value`,
			want:    `-o other.args=value`,
			wantErr: false,
		},
		{
			name:    "sftp.args with no additional args",
			input:   `-o sftp.args=-oBatchMode=yes`,
			want:    `-o sftp.args=-oBatchMode=yes`,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeSftpArgs(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("normalizeSftpArgs() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("normalizeSftpArgs() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestNormalizeSftpArgsEdgeCases(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:    "sftp.args in the middle of other options",
			input:   `-o other.opt=value -o sftp.args=-oBatchMode=yes -i /path/to/key -o another.opt=value`,
			want:    `-o other.opt=value -o sftp.args=-oBatchMode=yes -i /path/to/key -o another.opt=value`,
			wantErr: false,
		},
		{
			name:    "sftp.args with spaces inside quoted strings",
			input:   `-o sftp.args=-oBatchMode=yes -i "/path with spaces/to/key"`,
			want:    `-o sftp.args=-oBatchMode=yes -i /path with spaces/to/key`,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeSftpArgs(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("normalizeSftpArgs() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("normalizeSftpArgs() = %q, want %q", got, tt.want)
			}
		})
	}
}
