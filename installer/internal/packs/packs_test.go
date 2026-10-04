package packs

import (
	"regexp"
	"slices"
	"testing"
)

func TestNamesInPresetOrder(t *testing.T) {
	want := []string{"classic", "crt", "cozy", "arcade"}
	if got := Names(); !slices.Equal(got, want) {
		t.Fatalf("Names() = %v, want %v", got, want)
	}
}

func TestByName(t *testing.T) {
	p, ok := ByName("crt")
	if !ok {
		t.Fatal("crt missing")
	}
	if p.Bg != "#040a05" || p.Colors.Text != "#33ff66" || p.Spinner.ID != "comet" {
		t.Fatalf("crt = bg %s text %s spinner %s", p.Bg, p.Colors.Text, p.Spinner.ID)
	}
	if _, ok := ByName("nope"); ok {
		t.Fatal("ByName(nope) found a pack")
	}
}

func TestEveryPackIsComplete(t *testing.T) {
	hex := regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	for _, p := range All() {
		c := p.Colors
		for _, v := range []string{p.Bg, p.BorderColor, p.Spinner.Color, c.Accent, c.Text, c.Dim, c.Faint, c.Read, c.Edit, c.Shell, c.Agent, c.Pass, c.Fail} {
			if !hex.MatchString(v) {
				t.Errorf("%s: color %q is not #rrggbb", p.Name, v)
			}
		}
		if p.Spinner.Word == "" || len(p.Spinner.Frame) == 0 || len(p.Spinner.Frame[0]) == 0 {
			t.Errorf("%s: spinner word or frame is empty", p.Name)
		}
	}
}

func TestAllReturnsACopy(t *testing.T) {
	a := All()
	a[0].Name = "changed"
	if Names()[0] != "classic" {
		t.Fatal("All() exposed the package slice")
	}
}
